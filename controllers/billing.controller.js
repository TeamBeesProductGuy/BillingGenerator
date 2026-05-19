const path = require('path');
const fs = require('fs');
const { parseRateCard, parseAttendance } = require('../services/excelParser.service');
const { validateBillingMonth, crossValidate } = require('../services/validation.service');
const { calculateBilling } = require('../services/billing.service');
const { generateBillingExcel, generateBillingWorksheetBuffer } = require('../services/excelWriter.service');
const BillingModel = require('../models/billing.model');
const RateCardModel = require('../models/rateCard.model');
const AttendanceModel = require('../models/attendance.model');
const POModel = require('../models/purchaseOrder.model');
const { supabase } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');
const { logActivity } = require('../services/activityLog.service');
const { createManagerApprovalDraft } = require('../services/graphMail.service');

function isWarningError(errorItem) {
  return Boolean(errorItem && typeof errorItem.error_message === 'string' && errorItem.error_message.startsWith('WARNING:'));
}

function isRateCardBillableByLinkedStatus(rc) {
  return rc.sow_status !== 'Inactive' && rc.po_status !== 'Inactive';
}

function normalizeEmpCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEmpName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function buildUniqueNameSet(rows) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const key = normalizeEmpName(row.emp_name);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set(Array.from(counts.entries()).filter((entry) => entry[1] === 1).map((entry) => entry[0]));
}

async function getClientAbbreviationsByIds(clientIds) {
  const ids = Array.from(new Set((clientIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('clients')
    .select('id, client_name, abbreviation')
    .in('id', ids);
  if (error || !data) return [];

  const byId = new Map(data.map((client) => [Number(client.id), client]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((client) => String(client.abbreviation || client.client_name || '').trim())
    .filter(Boolean);
}

async function enrichSummaryWithClients(summary, billingItems, selectedClientIds) {
  const seen = new Set();
  const clientAbbreviations = [];
  (billingItems || []).forEach((item) => {
    const label = String(item.client_abbreviation || '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    clientAbbreviations.push(label);
  });

  const selectedAbbreviations = clientAbbreviations.length > 0
    ? clientAbbreviations
    : await getClientAbbreviationsByIds(selectedClientIds);

  return {
    ...summary,
    clientAbbreviations: selectedAbbreviations,
    clientLabel: selectedAbbreviations.length > 0 ? selectedAbbreviations.join(', ') : (selectedClientIds && selectedClientIds.length > 0 ? 'Selected clients' : 'All clients'),
  };
}

async function deriveRunClientLabel(run) {
  if (!run) return '';
  const seen = new Set();
  const labels = [];
  (run.items || []).concat(run.errors || []).forEach((row) => {
    const label = String(row.client_abbreviation || '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  });
  if (labels.length > 0) return labels.join(', ');
  if (!run.client_id) return '';
  const fallback = await getClientAbbreviationsByIds([run.client_id]);
  return fallback.join(', ');
}

async function getRunClientLabelsByIds(runIds) {
  const ids = Array.from(new Set((runIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return {};

  const [itemsResult, errorsResult] = await Promise.all([
    supabase
      .from('billing_items')
      .select('billing_run_id, client_abbreviation, client_name')
      .in('billing_run_id', ids),
    supabase
      .from('billing_errors')
      .select('billing_run_id, client_abbreviation, client_name')
      .in('billing_run_id', ids),
  ]);

  const rows = [];
  if (!itemsResult.error && Array.isArray(itemsResult.data)) rows.push(...itemsResult.data);
  if (!errorsResult.error && Array.isArray(errorsResult.data)) rows.push(...errorsResult.data);

  const labelsByRun = {};
  rows.forEach((row) => {
    const runId = Number(row.billing_run_id);
    const label = String(row.client_abbreviation || row.client_name || '').trim();
    if (!runId || !label) return;
    if (!labelsByRun[runId]) labelsByRun[runId] = [];
    const exists = labelsByRun[runId].some((item) => item.toLowerCase() === label.toLowerCase());
    if (!exists) labelsByRun[runId].push(label);
  });

  return Object.fromEntries(Object.entries(labelsByRun).map(([runId, labels]) => [runId, labels.join(', ')]));
}

function errorBelongsToSelectedClients(errorItem, selectedClientSet, empClientMap) {
  if (!selectedClientSet || selectedClientSet.size === 0) return true;
  if (errorItem.client_id) return selectedClientSet.has(Number(errorItem.client_id));
  const empCode = String(errorItem.emp_code || '').trim();
  if (!empCode || !empClientMap.has(empCode)) return false;
  return selectedClientSet.has(Number(empClientMap.get(empCode)));
}

/**
 * Resolve po_number strings (from Excel upload) to po_id integers
 * by looking up active POs in the database.
 */
async function resolvePoNumbers(records) {
  const poNumbers = [...new Set(records.filter((r) => r.po_number && !r.po_id).map((r) => r.po_number))];
  if (poNumbers.length === 0) return;

  const { data: pos, error } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status')
    .in('po_number', poNumbers)
    .eq('status', 'Active');
  if (error || !pos) return;

  const poMap = {};
  for (const po of pos) {
    poMap[po.po_number] = po;
  }
  for (const rc of records) {
    if (rc.po_number && !rc.po_id && poMap[rc.po_number]) {
      rc.po_id = poMap[rc.po_number].id;
      rc.po_status = poMap[rc.po_number].status;
    }
  }
}

async function resolveSowNumbers(records) {
  const sowNumbers = [...new Set(records.filter((r) => r.sow_number && !r.sow_id).map((r) => r.sow_number))];
  if (sowNumbers.length === 0) return;

  const { data: sows, error } = await supabase
    .from('sows')
    .select('id, sow_number, client_id, status')
    .in('sow_number', sowNumbers);
  if (error || !sows) return;

  const sowMap = {};
  for (const sow of sows) {
    sowMap[sow.sow_number] = sow;
  }
  const sowIds = sows.map((sow) => sow.id);
  const { data: sowItems } = await supabase
    .from('sow_items')
    .select('id, sow_id, role_position, amount, valid_from, valid_to')
    .in('sow_id', sowIds);
  const itemsBySowId = new Map();
  (sowItems || []).forEach((item) => {
    if (!itemsBySowId.has(item.sow_id)) itemsBySowId.set(item.sow_id, []);
    itemsBySowId.get(item.sow_id).push(item);
  });

  for (const record of records) {
    if (!record.sow_id && record.sow_number && sowMap[record.sow_number]) {
      record.sow_id = sowMap[record.sow_number].id;
      record.sow_status = sowMap[record.sow_number].status;
      record.client_id = record.client_id || sowMap[record.sow_number].client_id;
      const serviceKey = String(record.service_description || '').trim().toUpperCase();
      const matchedItem = (itemsBySowId.get(record.sow_id) || []).find((item) => String(item.role_position || '').trim().toUpperCase() === serviceKey);
      if (matchedItem) {
        record.sow_item_id = matchedItem.id;
        record.sow_item_valid_from = matchedItem.valid_from || null;
        record.sow_item_valid_to = matchedItem.valid_to || null;
        record.sow_item_role_position = matchedItem.role_position || null;
      }
    }
  }
}

async function resolveClientIdsByName(records) {
  const clientNames = [...new Set(records.filter((r) => r.client_name && !r.client_id).map((r) => r.client_name))];
  if (clientNames.length === 0) return;

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, client_name')
    .in('client_name', clientNames)
    .eq('is_active', true);
  if (error || !clients) return;

  const clientMap = new Map(clients.map((client) => [client.client_name, client.id]));
  for (const record of records) {
    if (!record.client_id && record.client_name && clientMap.has(record.client_name)) {
      record.client_id = clientMap.get(record.client_name);
    }
  }
}

async function resolvePoFromSow(records) {
  const sowIds = [...new Set(records.filter((r) => r.sow_id && !r.po_id).map((r) => r.sow_id))];
  if (sowIds.length === 0) return;

  const { data: pos, error } = await supabase
    .from('purchase_orders')
    .select('id, po_number, po_date, sow_id, client_id, status, created_at')
    .in('sow_id', sowIds)
    .eq('status', 'Active')
    .order('created_at', { ascending: false });
  if (error || !pos) return;

  const poMap = new Map();
  for (const po of pos) {
    if (!poMap.has(po.sow_id)) {
      poMap.set(po.sow_id, po);
    }
  }

  for (const record of records) {
    if (!record.po_id && record.sow_id && poMap.has(record.sow_id)) {
      const po = poMap.get(record.sow_id);
      record.po_id = po.id;
      record.po_number = record.po_number || po.po_number;
      record.po_date = record.po_date || po.po_date;
      record.po_status = po.status;
      record.client_id = record.client_id || po.client_id;
    }
  }
}

async function buildPoCandidates(billingItems) {
  const candidatesByEmp = {};
  const itemsNeedingPo = billingItems.filter((item) => !item.po_id);
  if (itemsNeedingPo.length === 0) return candidatesByEmp;

  const clientIds = [...new Set(itemsNeedingPo.map((item) => item.client_id).filter(Boolean))];
  const sowIds = [...new Set(itemsNeedingPo.map((item) => item.sow_id).filter(Boolean))];
  const posById = new Map();

  if (sowIds.length > 0) {
    const { data: sowPos, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, client_id, sow_id, status, po_value, consumed_value')
      .in('sow_id', sowIds)
      .eq('status', 'Active');
    if (!error && sowPos) {
      for (const po of sowPos) posById.set(po.id, po);
    }
  }

  if (clientIds.length > 0) {
    const { data: clientPos, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, client_id, sow_id, status, po_value, consumed_value')
      .in('client_id', clientIds)
      .eq('status', 'Active');
    if (!error && clientPos) {
      for (const po of clientPos) posById.set(po.id, po);
    }
  }

  const pos = Array.from(posById.values());
  if (pos.length === 0) return candidatesByEmp;

  for (const item of itemsNeedingPo) {
    const filtered = pos.filter((po) => {
      if (item.sow_id) return po.sow_id === item.sow_id;
      if (item.client_id) return po.client_id === item.client_id;
      return false;
    });

    const itemKey = item.id ? `item:${item.id}` : `emp:${item.emp_code}:sow:${item.sow_id || ''}`;
    candidatesByEmp[itemKey] = filtered.map((po) => ({
      id: po.id,
      po_number: po.po_number,
      sow_id: po.sow_id || null,
      remaining_value: Number(po.po_value || 0) - Number(po.consumed_value || 0),
    }));
    if (!candidatesByEmp[item.emp_code]) candidatesByEmp[item.emp_code] = candidatesByEmp[itemKey];
  }

  return candidatesByEmp;
}

function itemCanUsePo(item, po) {
  if (!po) return false;
  if (item.sow_id && po.sow_id) return item.sow_id === po.sow_id;
  if (item.client_id && po.client_id) return item.client_id === po.client_id;
  return false;
}

async function hydrateRunItemsForDecision(run) {
  if (!run || !Array.isArray(run.items) || run.items.length === 0) return;

  for (const item of run.items) {
    if (!item.client_id && run.client_id) {
      item.client_id = run.client_id;
    }
  }

  await resolveClientIdsByName(run.items);

  for (const item of run.items) {
    if (item.po_id && item.client_id && item.sow_id) continue;
    if (!item.emp_code || !item.client_id) continue;

    const currentRateCard = await RateCardModel.findMatchingByEmpCode(item.emp_code, item.client_id, {
      sow_id: item.sow_id,
      sow_item_id: item.sow_item_id,
    });
    if (!currentRateCard) continue;

    item.client_id = item.client_id || currentRateCard.client_id || run.client_id || null;
    item.sow_id = item.sow_id || currentRateCard.sow_id || null;
    item.sow_number = item.sow_number || currentRateCard.sow_number || null;
    item.po_id = item.po_id || currentRateCard.po_id || null;
    item.po_number = item.po_number || currentRateCard.po_number || null;
    item.po_date = item.po_date || currentRateCard.po_date || null;
    item.service_description = item.service_description || currentRateCard.service_description || null;
    item.client_abbreviation = item.client_abbreviation || currentRateCard.client_abbreviation || null;
  }

  await resolvePoFromSow(run.items);
  normalizeStoredServiceDurations(run);
}

/**
 * Auto-consume PO value for billing items that have a po_id.
 * Groups amounts by PO and records each consumption.
 */
async function autoConsumePOs(billingItems, billingMonth, runId) {
  const alreadyConsumed = await BillingModel.hasConsumptionForRun(runId);
  if (alreadyConsumed) {
    return [];
  }

  const consumptionByPo = {};
  for (const item of billingItems) {
    if (item.po_id) {
      if (!consumptionByPo[item.po_id]) consumptionByPo[item.po_id] = 0;
      consumptionByPo[item.po_id] += item.invoice_amount;
    }
  }

  const poConsumption = [];
  for (const [poId, totalAmount] of Object.entries(consumptionByPo)) {
    await POModel.addConsumption(parseInt(poId, 10), totalAmount, `Billing ${billingMonth} run #${runId}`, runId);
    poConsumption.push({ po_id: parseInt(poId, 10), amount: totalAmount, status: 'ok' });
  }
  return poConsumption;
}

function normalizeManagerKey(value) {
  return String(value || '').trim().toUpperCase();
}

function deriveRunStatusFromItems(items) {
  const rows = items || [];
  if (rows.length === 0) return 'Pending';
  const accepted = rows.filter((item) => item.approval_status === 'Accepted').length;
  const rejected = rows.filter((item) => item.approval_status === 'Rejected').length;
  const pending = rows.filter((item) => !item.approval_status || item.approval_status === 'Pending').length;
  if (accepted > 0 && pending === 0 && rejected === 0) return 'Accepted';
  if (rejected > 0 && pending === 0 && accepted === 0) return 'Rejected';
  if (accepted > 0 || rejected > 0) return 'Partially Accepted';
  return 'Pending';
}

function formatBillingMonthLabel(value) {
  const raw = String(value || '').trim();
  if (/^\d{6}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = parseInt(raw.slice(4, 6), 10) - 1;
    return new Date(Number(year), month, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }
  return raw || '-';
}

function toBillingDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatBillingDateKey(dateKey) {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[Math.max(0, Math.min(11, Number(month) - 1))] || month;
  return `${Number(day)}-${monthName}-${year}`;
}

function deriveServiceDurationFromStoredItem(item, billingMonth) {
  if (!item || item.billing_status !== 'Outside SOW Role Duration') return null;
  const note = String(item.billing_note || '');
  const match = note.match(/SOW role duration\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|open)\s+to\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|open)/i);
  if (!match || !billingMonth || String(billingMonth).length < 6) return null;

  const year = Number(String(billingMonth).slice(0, 4));
  const month = Number(String(billingMonth).slice(4, 6));
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);
  const chargingDate = toBillingDateKey(item.charging_date);
  const roleStart = match[1] === 'open' ? monthStart : match[1];
  const roleEnd = match[2] === 'open' ? monthEnd : match[2];
  const start = [monthStart, roleStart, chargingDate].filter(Boolean).sort().pop();
  const end = [monthEnd, roleEnd].filter(Boolean).sort()[0];

  if (!start || !end || start > end) return null;
  return `${formatBillingDateKey(start)} to ${formatBillingDateKey(end)}`;
}

function normalizeStoredServiceDurations(run) {
  if (!run || !Array.isArray(run.items)) return run;
  run.items.forEach((item) => {
    const duration = deriveServiceDurationFromStoredItem(item, run.billing_month);
    if (duration) item.billing_status = duration;
  });
  return run;
}

function toTwoDecimalValue(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(Math.max(number, 0) * 100) / 100;
}

function normalizeSowLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Not linked';
  return raw.replace(/^sow\s*(no\.?|#)?\s*/i, '').trim() || raw;
}

function buildManagerServiceDescription(item) {
  const role = String(item.service_description || item.role_position || 'Service').trim();
  const roleLine = /\bservices$/i.test(role)
    ? role.replace(/\bservices$/i, 'Services')
    : `${role} Services`;
  const candidate = item.emp_name || 'Candidate';
  return `${roleLine} for\nSow no. ${normalizeSowLabel(item.sow_number)} (${candidate})`;
}

function uniqueJoined(values, separator = ', ') {
  const seen = new Set();
  return (values || [])
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(separator);
}

function aggregateManagerRows(rows) {
  const map = new Map();
  (rows || []).forEach((item) => {
    const key = [
      String(item.reporting_manager || 'Unassigned').trim().toLowerCase(),
      String(item.emp_code || '').trim().toLowerCase(),
      String(item.emp_name || '').trim().toLowerCase(),
    ].join('|');
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        invoice_amount: 0,
        billing_hours: item.billing_hours !== null && item.billing_hours !== undefined ? 0 : null,
        _sowNumbers: [],
        _serviceDescriptions: [],
      });
    }
    const row = map.get(key);
    row.invoice_amount = Math.round((Number(row.invoice_amount || 0) + Number(item.invoice_amount || 0)) * 100) / 100;
    if (row.billing_hours !== null) {
      row.billing_hours = Math.round((Number(row.billing_hours || 0) + Number(item.billing_hours || 0)) * 100) / 100;
    }
    row._sowNumbers.push(item.sow_number);
    row._serviceDescriptions.push(item.service_description || item.role_position);
  });

  return Array.from(map.values()).map((row) => {
    const serviceDescription = uniqueJoined(row._serviceDescriptions) || row.service_description || row.role_position;
    const sowNumber = uniqueJoined(row._sowNumbers.map(normalizeSowLabel), ' & ');
    return {
      ...row,
      service_description: serviceDescription,
      role_position: serviceDescription,
      sow_number: sowNumber,
      service_description_html: buildManagerServiceDescription({
        ...row,
        service_description: serviceDescription,
        role_position: serviceDescription,
        sow_number: sowNumber,
      }),
    };
  });
}

function resolveUserDisplayName(user) {
  if (!user) return '';
  const metadata = user.user_metadata || {};
  return metadata.display_name || metadata.full_name || metadata.name || user.email || '';
}

async function autoConsumeApprovedItems(items, billingMonth, runId) {
  const consumptionByPo = {};
  const itemIdsByPo = {};
  for (const item of items) {
    if (!item.po_id || item.po_consumed_at) continue;
    if (!consumptionByPo[item.po_id]) {
      consumptionByPo[item.po_id] = 0;
      itemIdsByPo[item.po_id] = [];
    }
    consumptionByPo[item.po_id] += Number(item.invoice_amount || 0);
    itemIdsByPo[item.po_id].push(item.id);
  }

  const poConsumption = [];
  for (const [poId, totalAmount] of Object.entries(consumptionByPo)) {
    await POModel.addConsumption(parseInt(poId, 10), totalAmount, `Billing ${billingMonth} run #${runId}`, runId);
    await BillingModel.markItemsPoConsumed(runId, itemIdsByPo[poId]);
    poConsumption.push({ po_id: parseInt(poId, 10), amount: totalAmount, status: 'ok' });
  }
  return poConsumption;
}

async function createStoredRun({
  clientId = null,
  selectedClientIds = [],
  billingMonth,
  billingItems,
  allErrors,
  summary,
  blockedByErrors = false,
}) {
  const summaryWithClients = await enrichSummaryWithClients(summary, billingItems, selectedClientIds);
  const { filePath, filename } = await generateBillingExcel(billingItems, allErrors, billingMonth);

  const runId = await BillingModel.createRun({
    billing_month: billingMonth,
    client_id: clientId,
    total_employees: summaryWithClients.totalEmployees,
    total_amount: summaryWithClients.totalAmount,
    error_count: allErrors.length,
    output_file: filePath,
    request_status: 'Pending',
  });

  if (billingItems.length > 0) await BillingModel.addItems(runId, billingItems);
  if (allErrors.length > 0) await BillingModel.addErrors(runId, allErrors);

  return {
    billingRunId: runId,
    summary: summaryWithClients,
    errors: allErrors,
    billingItems,
    downloadUrl: `/api/billing/runs/${runId}/download`,
    filename,
    requestStatus: 'Pending',
    poConsumption: [],
    poCandidatesByEmp: await buildPoCandidates(billingItems),
    blockedByErrors,
    message: blockedByErrors ? 'Errors found. Service request was not generated. Please check the error report before proceeding.' : null,
  };
}

async function inferRunStatus(run) {
  if (!run) return run;
  if (Array.isArray(run.items) && run.items.length > 0) {
    return {
      ...run,
      request_status: deriveRunStatusFromItems(run.items),
    };
  }
  const hasConsumption = await BillingModel.hasConsumptionForRun(run.id);
  if (hasConsumption && (!run.request_status || run.request_status === 'Pending')) {
    return {
      ...run,
      request_status: 'Accepted',
    };
  }
  return {
    ...run,
    request_status: run.request_status || 'Pending',
  };
}

const billingController = {
  generateFromFiles: catchAsync(async (req, res) => {
    const billingMonth = req.body.billingMonth;
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);

    if (!req.files || !req.files.rateCardFile || !req.files.attendanceFile) {
      throw new AppError(400, 'Both Rate Card and Attendance Excel files are required');
    }

    const rateCardPath = req.files.rateCardFile[0].path;
    const attendancePath = req.files.attendanceFile[0].path;

    try {
      const rateCardResult = await parseRateCard(rateCardPath);
      const attendanceResult = await parseAttendance(attendancePath, billingMonth, {
        rateCards: rateCardResult.records,
      });

      await resolveSowNumbers(rateCardResult.records);
      // Resolve po_number strings from Excel to po_id integers from DB
      await resolvePoNumbers(rateCardResult.records);
      await resolvePoFromSow(rateCardResult.records);

      const warningErrors = [];
      const fatalErrors = [...rateCardResult.errors, ...attendanceResult.errors];

      // Warn about rate cards without PO linkage
      for (const rc of rateCardResult.records) {
        if (!rc.po_id) {
          warningErrors.push({ emp_code: rc.emp_code, emp_name: rc.emp_name || null, error_message: 'WARNING: PO not assigned' });
        }
      }

      if (rateCardResult.records.length > 0 && attendanceResult.records.length > 0) {
        const crossErrors = crossValidate(rateCardResult.records, attendanceResult.records);
        fatalErrors.push(...crossErrors);
      }

      if (fatalErrors.length > 0) {
        const allErrors = [...fatalErrors, ...warningErrors];
        const blockedSummary = {
          totalEmployees: 0,
          totalAmount: 0,
          errorCount: allErrors.length,
          daysInMonth: attendanceResult.records[0] && attendanceResult.records[0].days ? Object.keys(attendanceResult.records[0].days).length : 0,
          billingMonth,
        };
        const responseData = await createStoredRun({
          billingMonth,
          billingItems: [],
          allErrors,
          summary: blockedSummary,
          blockedByErrors: true,
        });
        await logActivity(req, {
          module: 'billing',
          action: 'generate_service_request',
          entityType: 'billing_run',
          entityId: responseData.billingRunId,
          entityLabel: `Service Request ${billingMonth}`,
          details: { summary: `Generated blocked service request for ${billingMonth} from uploaded files`, error_count: allErrors.length },
        });
        return res.json({ success: true, data: responseData });
      }

      const result = calculateBilling(rateCardResult.records, attendanceResult.records, billingMonth);
      const calcWarnings = result.errors.filter(isWarningError);
      const calcFatalErrors = result.errors.filter((item) => !isWarningError(item));
      warningErrors.push(...calcWarnings);
      fatalErrors.push(...calcFatalErrors);
      if (fatalErrors.length > 0) {
        const allErrors = [...fatalErrors, ...warningErrors];
        const blockedSummary = {
          ...result.summary,
          totalEmployees: 0,
          totalAmount: 0,
          errorCount: allErrors.length,
        };
        const responseData = await createStoredRun({
          billingMonth,
          billingItems: [],
          allErrors,
          summary: blockedSummary,
          blockedByErrors: true,
        });
        await logActivity(req, {
          module: 'billing',
          action: 'generate_service_request',
          entityType: 'billing_run',
          entityId: responseData.billingRunId,
          entityLabel: `Service Request ${billingMonth}`,
          details: { summary: `Generated blocked service request for ${billingMonth} from uploaded files`, error_count: allErrors.length },
        });
        return res.json({ success: true, data: responseData });
      }
      const responseData = await createStoredRun({
        billingMonth,
        billingItems: result.billingItems,
        allErrors: [...warningErrors],
        summary: result.summary,
      });
      await logActivity(req, {
        module: 'billing',
        action: 'generate_service_request',
        entityType: 'billing_run',
        entityId: responseData.billingRunId,
        entityLabel: `Service Request ${billingMonth}`,
        details: { summary: `Generated service request for ${billingMonth} from uploaded files`, total_amount: result.summary.totalAmount, employee_count: result.summary.totalEmployees },
      });

      res.json({ success: true, data: responseData });
    } finally {
      try { fs.unlinkSync(rateCardPath); } catch (e) { /* ignore */ }
      try { fs.unlinkSync(attendancePath); } catch (e) { /* ignore */ }
    }
  }),

  generateFromDb: catchAsync(async (req, res) => {
    const clientIdsRaw = Array.isArray(req.body.clientIds)
      ? req.body.clientIds
      : (req.body.clientIds !== undefined && req.body.clientIds !== null ? [req.body.clientIds] : []);
    const clientIds = clientIdsRaw
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);
    const { clientId, billingMonth } = req.body;
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);

    const selectedClientIds = clientIds.length > 0 ? clientIds : (clientId ? [parseInt(clientId, 10)] : []);
    const selectedClientSet = new Set(selectedClientIds.map((id) => Number(id)));
    const fetchedRateCards = await RateCardModel.findAll(selectedClientIds.length > 0 ? selectedClientIds : null);
    const rateCards = selectedClientSet.size > 0
      ? fetchedRateCards.filter((rc) => selectedClientSet.has(Number(rc.client_id)))
      : fetchedRateCards;

    if (rateCards.length === 0) {
      throw new AppError(400, 'No active rate cards found');
    }

    await resolvePoFromSow(rateCards);

    const billableRateCards = rateCards.filter((rc) => isRateCardBillableByLinkedStatus(rc) && !(rc.no_invoice || rc.billing_active === false));
    const allowedEmpCodes = new Set(billableRateCards.map((rc) => normalizeEmpCode(rc.emp_code)).filter(Boolean));
    const allowedEmpNames = buildUniqueNameSet(billableRateCards);
    const attendanceSummary = await AttendanceModel.getDetailedByMonth(billingMonth);

    const attendanceRecords = attendanceSummary
      .filter((a) => allowedEmpCodes.has(normalizeEmpCode(a.emp_code)) || allowedEmpNames.has(normalizeEmpName(a.emp_name)))
      .map((a) => ({
        emp_code: a.emp_code,
        emp_name: a.emp_name,
        reporting_manager: a.reporting_manager,
        leaves_taken: Number(a.leaves_taken),
        days_present: Number(a.days_present),
        billable_hours: a.billable_hours !== undefined ? Number(a.billable_hours) : Math.round(Number(a.days_present || 0) * 8.5 * 100) / 100,
        days: a.days || {},
        day_leave_units: a.day_leave_units || {},
      }));

    const warningErrors = [];
    const fatalErrors = [];
    const missingAttendanceErrors = [];
    const attendanceEmpCodes = new Set(attendanceRecords.map((a) => normalizeEmpCode(a.emp_code)).filter(Boolean));
    const attendanceEmpNames = buildUniqueNameSet(attendanceRecords);
    const hasAttendance = (rc) => attendanceEmpCodes.has(normalizeEmpCode(rc.emp_code)) || attendanceEmpNames.has(normalizeEmpName(rc.emp_name));
    const calculableRateCards = billableRateCards.filter(hasAttendance);

    // Keep missing attendance in the error report, but still generate for employees that can be calculated.
    for (const rc of billableRateCards) {
      if (!hasAttendance(rc)) {
        missingAttendanceErrors.push({
          client_id: rc.client_id || null,
          client_name: rc.client_name || null,
          client_abbreviation: rc.client_abbreviation || rc.abbreviation || null,
          emp_code: rc.emp_code,
          emp_name: rc.emp_name || null,
          error_message: 'Attendance not found',
        });
      }
    }

    // Warn about PO linkage only for rows that will be calculated.
    for (const rc of calculableRateCards) {
      if (!rc.po_id) {
        warningErrors.push({
          client_id: rc.client_id || null,
          client_name: rc.client_name || null,
          client_abbreviation: rc.client_abbreviation || rc.abbreviation || null,
          emp_code: rc.emp_code,
          emp_name: rc.emp_name || null,
          error_message: 'WARNING: PO not assigned',
        });
      }
    }

    if (calculableRateCards.length === 0 && missingAttendanceErrors.length > 0) {
      const allErrors = [...missingAttendanceErrors, ...warningErrors];
      const responseData = await createStoredRun({
        clientId: selectedClientIds.length === 1 ? selectedClientIds[0] : null,
        selectedClientIds,
        billingMonth,
        billingItems: [],
        allErrors,
        summary: {
          totalEmployees: 0,
          totalAmount: 0,
          errorCount: allErrors.length,
          daysInMonth: attendanceRecords.length > 0 ? (new Date(parseInt(billingMonth.substring(0, 4), 10), parseInt(billingMonth.substring(4, 6), 10), 0)).getDate() : 0,
          billingMonth,
        },
        blockedByErrors: true,
      });
      await logActivity(req, {
        module: 'billing',
        action: 'generate_service_request',
        entityType: 'billing_run',
        entityId: responseData.billingRunId,
        entityLabel: `Service Request ${billingMonth}`,
        details: { summary: `Generated blocked service request for ${billingMonth} from database`, error_count: allErrors.length },
      });
      return res.json({ success: true, data: responseData });
    }

    const result = calculateBilling(calculableRateCards, attendanceRecords, billingMonth);
    const calcWarnings = result.errors.filter(isWarningError);
    const calcFatalErrors = result.errors.filter((item) => !isWarningError(item));
    warningErrors.push(...calcWarnings);
    fatalErrors.push(...calcFatalErrors);
    const empClientMap = new Map(rateCards.map((rc) => [String(rc.emp_code || '').trim(), Number(rc.client_id)]));
    if (fatalErrors.length > 0) {
      const allErrors = [...fatalErrors, ...missingAttendanceErrors, ...warningErrors]
        .filter((item) => errorBelongsToSelectedClients(item, selectedClientSet, empClientMap));
      const responseData = await createStoredRun({
        clientId: selectedClientIds.length === 1 ? selectedClientIds[0] : null,
        selectedClientIds,
        billingMonth,
        billingItems: [],
        allErrors,
        summary: {
          ...result.summary,
          totalEmployees: 0,
          totalAmount: 0,
          errorCount: allErrors.length,
        },
        blockedByErrors: true,
      });
      await logActivity(req, {
        module: 'billing',
        action: 'generate_service_request',
        entityType: 'billing_run',
        entityId: responseData.billingRunId,
        entityLabel: `Service Request ${billingMonth}`,
        details: { summary: `Generated blocked service request for ${billingMonth} from database`, error_count: allErrors.length },
      });
      return res.json({ success: true, data: responseData });
    }
    const scopedErrors = [...missingAttendanceErrors, ...warningErrors]
      .filter((item) => errorBelongsToSelectedClients(item, selectedClientSet, empClientMap));
    const responseData = await createStoredRun({
      clientId: selectedClientIds.length === 1 ? selectedClientIds[0] : null,
      selectedClientIds,
      billingMonth,
      billingItems: result.billingItems,
      allErrors: scopedErrors,
      summary: {
        ...result.summary,
        errorCount: scopedErrors.length,
      },
    });
    await logActivity(req, {
      module: 'billing',
      action: 'generate_service_request',
      entityType: 'billing_run',
      entityId: responseData.billingRunId,
      entityLabel: `Service Request ${billingMonth}`,
      details: { summary: `Generated service request for ${billingMonth} from database`, total_amount: result.summary.totalAmount, employee_count: result.summary.totalEmployees },
    });

    res.json({ success: true, data: responseData });
  }),

  listRuns: catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const runs = await BillingModel.findRuns(limit, offset);
    const normalizedRuns = await Promise.all(runs.map(inferRunStatus));
    const labelsByRun = await getRunClientLabelsByIds(normalizedRuns.map((run) => run.id));
    const fallbackClientIds = normalizedRuns
      .filter((run) => !labelsByRun[run.id] && run.client_id)
      .map((run) => run.client_id);
    const fallbackLabels = await getClientAbbreviationsByIds(fallbackClientIds);
    const fallbackByClientId = {};
    fallbackClientIds.forEach((clientId, index) => {
      if (fallbackLabels[index]) fallbackByClientId[clientId] = fallbackLabels[index];
    });
    res.json({
      success: true,
      data: normalizedRuns.map((run) => ({
        ...run,
        clientLabel: labelsByRun[run.id] || fallbackByClientId[run.client_id] || '',
      })),
    });
  }),

  getRunDetails: catchAsync(async (req, res) => {
    const baseRun = await BillingModel.findRunById(parseInt(req.params.id, 10));
    const run = await inferRunStatus(baseRun);
    if (!run) throw new AppError(404, 'Billing run not found');
    await hydrateRunItemsForDecision(run);
    res.json({
      success: true,
      data: {
        ...run,
        clientLabel: await deriveRunClientLabel(run),
        poCandidatesByEmp: await buildPoCandidates(run.items || []),
      },
    });
  }),

  decideRun: catchAsync(async (req, res) => {
    const runId = parseInt(req.params.id, 10);
    const { decision, poAssignments = [], approvedManagers = [] } = req.body;
    const baseRun = await BillingModel.findRunById(runId);
    const run = await inferRunStatus(baseRun);
    if (!run) throw new AppError(404, 'Billing run not found');
    await hydrateRunItemsForDecision(run);
    if (run.request_status && !['Pending', 'Partially Accepted'].includes(run.request_status)) {
      throw new AppError(400, `This service request is already ${run.request_status.toLowerCase()}`);
    }

    if (decision === 'Rejected') {
      const pendingItemIds = (run.items || [])
        .filter((item) => !item.approval_status || item.approval_status === 'Pending')
        .map((item) => item.id)
        .filter(Boolean);
      await BillingModel.markItemsRejected(runId, pendingItemIds);
      const refreshedRun = await BillingModel.findRunById(runId);
      const requestStatus = deriveRunStatusFromItems(refreshedRun ? refreshedRun.items : run.items);
      await BillingModel.updateRunStatusOnly(runId, requestStatus);
      return res.json({ success: true, data: { billingRunId: runId, requestStatus, poConsumption: [] } });
    }

    const managerKeys = new Set((approvedManagers || []).map(normalizeManagerKey).filter((value) => value || value === ''));
    const pendingItems = (run.items || []).filter((item) => !item.approval_status || item.approval_status === 'Pending');
    const itemsToApprove = managerKeys.size > 0
      ? pendingItems.filter((item) => managerKeys.has(normalizeManagerKey(item.reporting_manager || 'Unassigned')))
      : pendingItems;

    if (itemsToApprove.length === 0) {
      throw new AppError(400, 'No pending service request items matched this approval.');
    }

    const missingItems = itemsToApprove.filter((item) => !item.po_id);
    if (missingItems.length > 0) {
      const assignmentMap = new Map();
      const missingCountByEmp = new Map();
      missingItems.forEach((item) => {
        const empKey = String(item.emp_code || '').trim();
        if (!empKey) return;
        missingCountByEmp.set(empKey, (missingCountByEmp.get(empKey) || 0) + 1);
      });
      poAssignments.forEach((entry) => {
        if (entry.item_id) assignmentMap.set(`item:${entry.item_id}`, entry);
        if (entry.emp_code && missingCountByEmp.get(String(entry.emp_code).trim()) === 1 && !assignmentMap.has(`emp:${entry.emp_code}`)) {
          assignmentMap.set(`emp:${entry.emp_code}`, entry);
        }
      });
      const resolvedAssignments = [];

      for (const item of missingItems) {
        const assignment = assignmentMap.get(`item:${item.id}`) || assignmentMap.get(`emp:${item.emp_code}`);
        if (!assignment) {
          throw new AppError(400, `PO selection or PO number is required for ${item.emp_code} before acceptance`);
        }
        let po = null;
        if (assignment.po_id) {
          po = await POModel.findById(assignment.po_id);
        } else if (assignment.po_number) {
          po = await POModel.findByNumber(assignment.po_number.trim());
        }
        if (!po) {
          throw new AppError(404, `Selected PO not found for ${item.emp_code}`);
        }
        if (po.status !== 'Active') {
          throw new AppError(400, `Selected PO is not Active for ${item.emp_code}`);
        }
        if ((item.sow_id || item.client_id) && !itemCanUsePo(item, po)) {
          throw new AppError(400, `Selected PO is not linked to the correct client/SOW for ${item.emp_code}`);
        }
        resolvedAssignments.push({ emp_code: item.emp_code, item_id: item.id, po_id: po.id });
        item.po_id = po.id;
      }

      if (resolvedAssignments.length > 0) {
        await BillingModel.assignMissingPOs(runId, resolvedAssignments);
      }
    }

    const approvedManagerNames = Array.from(new Set(itemsToApprove.map((item) => item.reporting_manager || 'Unassigned')));
    await BillingModel.markItemsApproved(runId, itemsToApprove.map((item) => item.id).filter(Boolean), approvedManagerNames.join(', '));
    itemsToApprove.forEach((item) => {
      item.approval_status = 'Accepted';
      item.approved_by_manager = approvedManagerNames.join(', ');
    });

    const poConsumption = await autoConsumeApprovedItems(itemsToApprove, run.billing_month, runId);
    const refreshedRun = await BillingModel.findRunById(runId);
    const requestStatus = deriveRunStatusFromItems(refreshedRun ? refreshedRun.items : run.items);
    await BillingModel.updateRunStatusOnly(runId, requestStatus);

    res.json({
      success: true,
      data: {
        billingRunId: runId,
        requestStatus,
        poConsumption,
      },
    });
  }),

  updateRunItem: catchAsync(async (req, res) => {
    const runId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const run = await BillingModel.findRunById(runId);
    if (!run) throw new AppError(404, 'Billing run not found');
    if (!['Pending', 'Partially Accepted'].includes(run.request_status || deriveRunStatusFromItems(run.items || []))) {
      throw new AppError(400, 'Approved or rejected service requests cannot be edited');
    }
    const item = (run.items || []).find((row) => Number(row.id) === itemId);
    if (!item) throw new AppError(404, 'Service request item not found');
    if (item.approval_status === 'Accepted') throw new AppError(400, 'Approved manager request cannot be edited');

    const leavesTaken = toTwoDecimalValue(req.body.leaves_taken);
    const daysPresent = toTwoDecimalValue(req.body.days_present);
    const effectiveDays = Number(item.effective_days || item.days_in_month || 0);
    const leavesAllowed = Number(item.leaves_allowed || 0);
    let billingHours = req.body.billing_hours === null || req.body.billing_hours === undefined ? null : toTwoDecimalValue(req.body.billing_hours);
    let chargeableDays = toTwoDecimalValue(Math.min(Math.max(effectiveDays - leavesTaken + leavesAllowed, 0), 30, effectiveDays));
    let invoiceAmount = Math.round(((chargeableDays / Number(item.days_in_month || 30)) * Number(item.monthly_rate || 0)) * 100) / 100;

    if (item.billing_method === 'sgtc_hours') {
      billingHours = Number.isFinite(billingHours) ? billingHours : Math.min(toTwoDecimalValue(daysPresent * 8.5), 170);
      chargeableDays = daysPresent;
      invoiceAmount = Math.round(((Number(item.monthly_rate || 0) / 170) * billingHours) * 100) / 100;
    }

    const updated = await BillingModel.updateItem(runId, itemId, {
      leaves_taken: leavesTaken,
      days_present: daysPresent,
      billing_hours: billingHours,
      chargeable_days: chargeableDays,
      invoice_amount: invoiceAmount,
      billing_note: 'Manual attendance correction applied',
      billing_status: item.billing_status || 'Active',
    });
    const totals = await BillingModel.updateRunTotals(runId);
    const refreshed = await BillingModel.findRunById(runId);
    const requestStatus = deriveRunStatusFromItems(refreshed ? refreshed.items : run.items);
    await BillingModel.updateRunStatusOnly(runId, requestStatus);
    const finalRun = await BillingModel.findRunById(runId);
    if (finalRun) {
      await hydrateRunItemsForDecision(finalRun);
      finalRun.request_status = requestStatus;
      finalRun.total_employees = totals.totalEmployees;
      finalRun.total_amount = totals.totalAmount;
    }
    res.json({
      success: true,
      data: {
        item: updated,
        totals,
        requestStatus,
        run: finalRun ? {
          ...finalRun,
          poCandidatesByEmp: await buildPoCandidates(finalRun.items || []),
        } : null,
      },
    });
  }),

  createManagerDraft: catchAsync(async (req, res) => {
    const runId = parseInt(req.params.id, 10);
    const managerName = String(req.body.manager_name || '').trim();
    const run = await BillingModel.findRunById(runId);
    if (!run) throw new AppError(404, 'Billing run not found');
    await hydrateRunItemsForDecision(run);

    const rows = (run.items || []).filter((item) => normalizeManagerKey(item.reporting_manager || 'Unassigned') === normalizeManagerKey(managerName));
    if (rows.length === 0) {
      throw new AppError(404, 'No service request items found for this reporting manager');
    }

    const decoratedRows = aggregateManagerRows(rows);

    const draft = await createManagerApprovalDraft({
      reportingManager: managerName,
      billingMonth: run.billing_month,
      rows: decoratedRows,
      to: req.body.to,
      cc: req.body.cc,
      userName: resolveUserDisplayName(req.user),
      userEmail: req.user && req.user.email ? req.user.email : '',
    });

    await logActivity(req, {
      module: 'billing',
      action: 'create_manager_draft_mail',
      entityType: 'billing_run',
      entityId: runId,
      entityLabel: `${managerName} - ${formatBillingMonthLabel(run.billing_month)}`,
      details: {
        summary: `Created manager approval draft for ${managerName}`,
        billing_month: run.billing_month,
        recipient_to: req.body.to,
        recipient_cc: req.body.cc || '',
      },
    });

    res.json({
      success: true,
      data: {
        runId,
        managerName,
        subject: draft.subject,
        webLink: draft.webLink,
        composeUrl: draft.composeUrl,
      },
    });
  }),

  downloadFile: catchAsync(async (req, res) => {
    const run = await BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    await hydrateRunItemsForDecision(run);
    const { filePath } = await generateBillingExcel(run.items || [], run.errors || [], run.billing_month);
    run.output_file = filePath;
    if (!run.output_file || !fs.existsSync(run.output_file)) {
      throw new AppError(404, 'Output file not found');
    }
    const filename = path.basename(run.output_file);
    res.download(run.output_file, filename);
  }),

  downloadWorksheet: catchAsync(async (req, res) => {
    const run = await BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    await hydrateRunItemsForDecision(run);

    const worksheet = String(req.params.worksheet || '').toLowerCase();
    const validWorksheets = {
      billing_working: 'Service_Request',
      manager_summary: 'Manager_Approval_Request',
      error_report: 'Error_Report',
    };
    if (!validWorksheets[worksheet]) {
      throw new AppError(400, 'Invalid worksheet requested');
    }

    const buffer = await generateBillingWorksheetBuffer(run.items || [], run.errors || [], worksheet, run.billing_month);
    const filename = `${validWorksheets[worksheet]}_${run.billing_month}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(Buffer.from(buffer));
  }),
};

module.exports = billingController;
