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

/**
 * Resolve po_number strings (from Excel upload) to po_id integers
 * by looking up active POs in the database.
 */
async function resolvePoNumbers(records) {
  const poNumbers = [...new Set(records.filter((r) => r.po_number && !r.po_id).map((r) => r.po_number))];
  if (poNumbers.length === 0) return;

  const { data: pos, error } = await supabase
    .from('purchase_orders')
    .select('id, po_number')
    .in('po_number', poNumbers)
    .eq('status', 'Active');
  if (error || !pos) return;

  const poMap = {};
  for (const po of pos) {
    poMap[po.po_number] = po.id;
  }
  for (const rc of records) {
    if (rc.po_number && !rc.po_id && poMap[rc.po_number]) {
      rc.po_id = poMap[rc.po_number];
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

  for (const record of records) {
    if (!record.sow_id && record.sow_number && sowMap[record.sow_number]) {
      record.sow_id = sowMap[record.sow_number].id;
      record.client_id = record.client_id || sowMap[record.sow_number].client_id;
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
    .select('id, po_number, sow_id, client_id, status, created_at')
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

    candidatesByEmp[item.emp_code] = filtered.map((po) => ({
      id: po.id,
      po_number: po.po_number,
      sow_id: po.sow_id || null,
      remaining_value: Number(po.po_value || 0) - Number(po.consumed_value || 0),
    }));
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

    const currentRateCard = await RateCardModel.findByEmpCode(item.emp_code, item.client_id);
    if (!currentRateCard) continue;

    item.client_id = item.client_id || currentRateCard.client_id || run.client_id || null;
    item.sow_id = item.sow_id || currentRateCard.sow_id || null;
    item.sow_number = item.sow_number || currentRateCard.sow_number || null;
    item.po_id = item.po_id || currentRateCard.po_id || null;
  }

  await resolvePoFromSow(run.items);
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

async function createStoredRun({
  clientId = null,
  billingMonth,
  billingItems,
  allErrors,
  summary,
}) {
  const { filePath, filename } = await generateBillingExcel(billingItems, allErrors, billingMonth);

  const runId = await BillingModel.createRun({
    billing_month: billingMonth,
    client_id: clientId,
    total_employees: summary.totalEmployees,
    total_amount: summary.totalAmount,
    error_count: allErrors.length,
    output_file: filePath,
    request_status: 'Pending',
  });

  if (billingItems.length > 0) await BillingModel.addItems(runId, billingItems);
  if (allErrors.length > 0) await BillingModel.addErrors(runId, allErrors);

  return {
    billingRunId: runId,
    summary,
    errors: allErrors,
    billingItems,
    downloadUrl: `/api/billing/runs/${runId}/download`,
    filename,
    requestStatus: 'Pending',
    poConsumption: [],
    poCandidatesByEmp: await buildPoCandidates(billingItems),
  };
}

async function inferRunStatus(run) {
  if (!run) return run;
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
      const attendanceResult = await parseAttendance(attendancePath, billingMonth);

      await resolveSowNumbers(rateCardResult.records);
      // Resolve po_number strings from Excel to po_id integers from DB
      await resolvePoNumbers(rateCardResult.records);
      await resolvePoFromSow(rateCardResult.records);

      const allErrors = [...rateCardResult.errors, ...attendanceResult.errors];

      // Warn about rate cards without PO linkage
      for (const rc of rateCardResult.records) {
        if (!rc.po_id) {
          allErrors.push({ emp_code: rc.emp_code, error_message: `WARNING: ${rc.emp_code} (${rc.emp_name}) has no PO assignment. Billing will not consume from any PO.` });
        }
      }

      if (rateCardResult.records.length > 0 && attendanceResult.records.length > 0) {
        const crossErrors = crossValidate(rateCardResult.records, attendanceResult.records);
        allErrors.push(...crossErrors);
      }

      const result = calculateBilling(rateCardResult.records, attendanceResult.records, billingMonth);
      allErrors.push(...result.errors);
      const responseData = await createStoredRun({
        billingMonth,
        billingItems: result.billingItems,
        allErrors,
        summary: result.summary,
      });

      res.json({ success: true, data: responseData });
    } finally {
      try { fs.unlinkSync(rateCardPath); } catch (e) { /* ignore */ }
      try { fs.unlinkSync(attendancePath); } catch (e) { /* ignore */ }
    }
  }),

  generateFromDb: catchAsync(async (req, res) => {
    const { clientId, billingMonth } = req.body;
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);

    const rateCards = await RateCardModel.findAll(clientId || null);

    if (rateCards.length === 0) {
      throw new AppError(400, 'No active rate cards found');
    }

    await resolvePoFromSow(rateCards);

    const attendanceSummary = await AttendanceModel.getSummary(billingMonth);

    const attendanceRecords = attendanceSummary.map((a) => ({
      emp_code: a.emp_code,
      emp_name: a.emp_name,
      reporting_manager: a.reporting_manager,
      leaves_taken: Number(a.leaves_taken),
      days: {},
    }));

    const allErrors = [];

    // Warn about rate cards without PO linkage
    for (const rc of rateCards) {
      if (!rc.po_id) {
        allErrors.push({ emp_code: rc.emp_code, error_message: `WARNING: ${rc.emp_code} (${rc.emp_name}) has no PO assignment. Billing will not consume from any PO.` });
      }
    }

    const crossErrors = crossValidate(rateCards, attendanceRecords);
    allErrors.push(...crossErrors);

    const result = calculateBilling(rateCards, attendanceRecords, billingMonth);
    allErrors.push(...result.errors);
    const responseData = await createStoredRun({
      clientId: clientId || null,
      billingMonth,
      billingItems: result.billingItems,
      allErrors,
      summary: result.summary,
    });

    res.json({ success: true, data: responseData });
  }),

  listRuns: catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const runs = await BillingModel.findRuns(limit, offset);
    const normalizedRuns = await Promise.all(runs.map(inferRunStatus));
    res.json({ success: true, data: normalizedRuns });
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
        poCandidatesByEmp: await buildPoCandidates(run.items || []),
      },
    });
  }),

  decideRun: catchAsync(async (req, res) => {
    const runId = parseInt(req.params.id, 10);
    const { decision, poAssignments = [] } = req.body;
    const baseRun = await BillingModel.findRunById(runId);
    const run = await inferRunStatus(baseRun);
    if (!run) throw new AppError(404, 'Billing run not found');
    await hydrateRunItemsForDecision(run);
    if (run.request_status && run.request_status !== 'Pending') {
      throw new AppError(400, `This service request is already ${run.request_status.toLowerCase()}`);
    }

    if (decision === 'Rejected') {
      await BillingModel.updateRunStatus(runId, 'Rejected');
      return res.json({ success: true, data: { billingRunId: runId, requestStatus: 'Rejected', poConsumption: [] } });
    }

    const missingItems = run.items.filter((item) => !item.po_id);
    if (missingItems.length > 0) {
      const assignmentMap = new Map(poAssignments.map((entry) => [entry.emp_code, entry]));
      const resolvedAssignments = [];

      for (const item of missingItems) {
        const assignment = assignmentMap.get(item.emp_code);
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
        resolvedAssignments.push({ emp_code: item.emp_code, po_id: po.id });
        item.po_id = po.id;
      }

      if (resolvedAssignments.length > 0) {
        await BillingModel.assignMissingPOs(runId, resolvedAssignments);
      }
    }

    const poConsumption = await autoConsumePOs(run.items, run.billing_month, runId);
    await BillingModel.updateRunStatus(runId, 'Accepted');

    res.json({
      success: true,
      data: {
        billingRunId: runId,
        requestStatus: 'Accepted',
        poConsumption,
      },
    });
  }),

  downloadFile: catchAsync(async (req, res) => {
    const run = await BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    if (!run.output_file || !fs.existsSync(run.output_file)) {
      throw new AppError(404, 'Output file not found');
    }
    const filename = path.basename(run.output_file);
    res.download(run.output_file, filename);
  }),

  downloadWorksheet: catchAsync(async (req, res) => {
    const run = await BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');

    const worksheet = String(req.params.worksheet || '').toLowerCase();
    const validWorksheets = {
      billing_working: 'Billing_Working',
      manager_summary: 'Manager_Summary',
      error_report: 'Error_Report',
    };
    if (!validWorksheets[worksheet]) {
      throw new AppError(400, 'Invalid worksheet requested');
    }

    const buffer = await generateBillingWorksheetBuffer(run.items || [], run.errors || [], worksheet);
    const filename = `${validWorksheets[worksheet]}_${run.billing_month}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(Buffer.from(buffer));
  }),
};

module.exports = billingController;
