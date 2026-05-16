const fs = require('fs');
const ExcelJS = require('exceljs');
const RateCardModel = require('../models/rateCard.model');
const ClientModel = require('../models/client.model');
const POModel = require('../models/purchaseOrder.model');
const SOWModel = require('../models/sow.model');
const { parseRateCard } = require('../services/excelParser.service');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');
const {
  requireAdminApproval,
  buildRateCardDeleteRequest,
} = require('../services/adminApproval.service');

function isSelectableSowStatus(status) {
  return ['Draft', 'Amendment Draft', 'Signed', 'Active'].includes(status);
}

function isCleanPersonName(value) {
  return /^[A-Za-z ]+$/.test(String(value || '').trim());
}

const rateCardController = {
  list: catchAsync(async (req, res) => {
    const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
    const cards = await RateCardModel.findAll(clientId);
    res.json({ success: true, data: cards });
  }),

  getById: catchAsync(async (req, res) => {
    const card = await RateCardModel.findById(parseInt(req.params.id, 10));
    if (!card) throw new AppError(404, 'Rate card not found');
    res.json({ success: true, data: card });
  }),

  create: catchAsync(async (req, res) => {
    const payload = normalizeRateCardPayload(req.body);
    const {
      client_id,
      emp_code,
      emp_name,
      doj,
      reporting_manager,
      service_description,
      sow_item_id,
      monthly_rate,
      leaves_allowed,
      charging_date,
      sow_id,
      po_id,
      billing_active,
      no_invoice,
      pause_billing,
      pause_start_date,
      pause_end_date,
      disable_billing,
      disable_from_date,
    } = payload;

    const sow = await validateSowForRateCardClient(client_id, sow_id, 'creating a Rate Card');
    validateRateCardDates(doj, charging_date);
    validateBillingWindowDates(payload);
    const sowItem = validateSowServiceDescription(sow, service_description, sow_item_id);
    await validateEmployeeSowWindow(payload, sow, sowItem, null);
    await validateSowCapacity(sow, service_description, monthly_rate, no_invoice || disable_billing, null, sowItem);

    if (po_id) await validatePurchaseOrderForSow(po_id, client_id, sow_id);

    try {
      const id = await RateCardModel.create({
        client_id,
        emp_code,
        emp_name,
        doj,
        reporting_manager,
        service_description,
        sow_item_id: sowItem ? sowItem.id : null,
        monthly_rate,
        leaves_allowed,
        charging_date,
        sow_id,
        po_id,
        billing_active,
        no_invoice,
        pause_billing,
        pause_start_date,
        pause_end_date,
        disable_billing,
        disable_from_date,
      });
      res.status(201).json({ success: true, data: { id } });
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))) {
        throw new AppError(409, 'This employee is already linked to this SOW role for the selected client');
      }
      throw err;
    }
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await RateCardModel.findById(id);
    if (!existing) throw new AppError(404, 'Rate card not found');
    const payload = normalizeRateCardPayload(req.body);

    const clientId = payload.client_id || existing.client_id;
    const sowId = payload.sow_id || existing.sow_id;
    const sow = await validateSowForRateCardClient(clientId, sowId, 'linking a Rate Card');
    validateRateCardDates(payload.doj, payload.charging_date);
    validateBillingWindowDates(payload);
    const serviceDescription = payload.service_description || existing.service_description;
    const sowItemId = payload.sow_item_id !== undefined ? payload.sow_item_id : existing.sow_item_id;
    const sowItem = validateSowServiceDescription(sow, serviceDescription, sowItemId);
    await validateEmployeeSowWindow({ ...existing, ...payload, client_id: clientId }, sow, sowItem, id);
    await validateSowCapacity(
      sow,
      serviceDescription,
      payload.monthly_rate !== undefined ? payload.monthly_rate : existing.monthly_rate,
      payload.no_invoice || payload.disable_billing,
      id,
      sowItem
    );
    payload.sow_item_id = sowItem ? sowItem.id : null;

    const effectivePoId = payload.po_id !== undefined ? payload.po_id : existing.po_id;
    if (effectivePoId) await validatePurchaseOrderForSow(effectivePoId, clientId, sowId);

    try {
      await RateCardModel.update(id, payload);
      res.json({ success: true, data: { id } });
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))) {
        throw new AppError(409, 'This employee is already linked to this SOW role for the selected client');
      }
      throw err;
    }
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await RateCardModel.findById(id);
    if (!existing) throw new AppError(404, 'Rate card not found');
    if (await requireAdminApproval(req, res, await buildRateCardDeleteRequest(req, existing))) return;
    await RateCardModel.softDelete(id);
    res.json({ success: true, data: { message: 'Rate card deleted' } });
  }),

  updateLeavesAllowed: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await RateCardModel.findById(id);
    if (!existing) throw new AppError(404, 'Rate card not found');
    await RateCardModel.updateLeavesAllowed(id, req.body.leaves_allowed);
    res.json({ success: true, data: { id } });
  }),

  uploadExcel: catchAsync(async (req, res) => {
    if (!req.file) throw new AppError(400, 'Excel file is required');
    const clientId = parseInt(req.body.clientId, 10);
    if (!clientId) throw new AppError(400, 'clientId is required');

    const client = await ClientModel.findById(clientId);
    if (!client) throw new AppError(404, 'Client not found');

    try {
      const { records, errors } = await parseRateCard(req.file.path);

      const sowList = await SOWModel.findAll(clientId, null, { includeLinked: true });
      const sowMap = new Map(sowList.map((sow) => [sow.sow_number, sow.id]));
      const sowById = new Map(sowList.map((sow) => [sow.id, sow]));
      const poList = await POModel.findAll(clientId, 'Active');
      const poMap = new Map(poList.map((po) => [po.po_number, po]));
      const validRecords = [];
      for (const r of records) {
        const sowId = sowMap.get(r.sow_number);
        if (!sowId) {
          errors.push({ emp_code: r.emp_code, error_message: `SOW number "${r.sow_number}" not found for this client` });
          continue;
        }
        r.sow_id = sowId;
        const sow = sowById.get(sowId);
        try {
          if (r.reporting_manager && !isCleanPersonName(r.reporting_manager)) {
            throw new AppError(400, 'Reporting Manager can contain only letters and spaces');
          }
          validateRateCardDates(r.doj, r.charging_date);
          validateBillingWindowDates(r);
          const sowItem = validateSowServiceDescription(sow, r.service_description, r.sow_item_id);
          r.sow_item_id = sowItem ? sowItem.id : null;
          await validateEmployeeSowWindow({ ...r, client_id: clientId }, sow, sowItem, null, validRecords);
          await validateSowCapacity(sow, r.service_description, r.monthly_rate, r.no_invoice || r.disable_billing, null, sowItem);
        } catch (err) {
          errors.push({ emp_code: r.emp_code, error_message: err.message || 'Rate card validation failed' });
          continue;
        }

        if (r.po_number) {
          const po = poMap.get(r.po_number);
          if (!po) {
            errors.push({ emp_code: r.emp_code, error_message: `PO number "${r.po_number}" not found or not Active for this client` });
            continue;
          }
          if (Number(po.sow_id) !== Number(r.sow_id)) {
            errors.push({ emp_code: r.emp_code, error_message: `PO number "${r.po_number}" is not linked to SOW "${r.sow_number}"` });
            continue;
          }
          r.po_id = po.id;
        }
        validRecords.push(r);
        if (r.po_number && !r.po_id) {
          errors.push({ emp_code: r.emp_code, error_message: `PO number "${r.po_number}" not found or not Active for this client` });
        }
      }

      if (validRecords.length > 0) {
        const dbRecords = validRecords.map((r) => ({ ...r, client_id: clientId }));
        await RateCardModel.bulkCreate(dbRecords);
      }

      res.json({
        success: true,
        data: {
          imported: validRecords.length,
          errors: errors.length,
          errorDetails: errors,
        },
      });
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }),

  exportExcel: catchAsync(async (req, res) => {
    const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
    const cards = await RateCardModel.findAll(clientId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rate Cards');
    sheet.columns = [
      { header: 'Client Name', key: 'client_name', width: 20 },
      { header: 'Emp Code', key: 'emp_code', width: 15 },
      { header: 'Emp Name', key: 'emp_name', width: 20 },
      { header: 'DOJ', key: 'doj', width: 12 },
      { header: 'Reporting Manager', key: 'reporting_manager', width: 20 },
      { header: 'Monthly Rate', key: 'monthly_rate', width: 15 },
      { header: 'Leaves Allowed', key: 'leaves_allowed', width: 15 },
      { header: 'Date of Reporting', key: 'charging_date', width: 18 },
      { header: 'SOW Number', key: 'sow_number', width: 18 },
      { header: 'PO Number', key: 'po_number', width: 18 },
      { header: 'Pause Billing', key: 'pause_billing', width: 15 },
      { header: 'Pause From', key: 'pause_start_date', width: 15 },
      { header: 'Pause To', key: 'pause_end_date', width: 15 },
      { header: 'Disable Billing', key: 'disable_billing', width: 16 },
      { header: 'Disable From', key: 'disable_from_date', width: 16 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const card of cards) {
      sheet.addRow(card);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=RateCards_Export.xlsx');
    await workbook.xlsx.write(res);
  }),
};

function validateRateCardDates(doj, reportingDate) {
  if (doj && reportingDate && String(doj) > String(reportingDate)) {
    throw new AppError(400, 'Date of Joining must be less than or equal to Date of Reporting');
  }
}

function validateBillingWindowDates(payload) {
  if (payload.pause_billing && (!payload.pause_start_date || !payload.pause_end_date)) {
    throw new AppError(400, 'Pause billing requires from and to dates');
  }
  if (payload.pause_start_date && payload.pause_end_date && String(payload.pause_start_date) > String(payload.pause_end_date)) {
    throw new AppError(400, 'Pause billing from date must be less than or equal to to date');
  }
  if (payload.disable_billing && !payload.disable_from_date) {
    throw new AppError(400, 'Disable billing requires a from date');
  }
}

async function validateSowForRateCardClient(clientId, sowId, actionLabel) {
  const sow = await SOWModel.findById(sowId);
  if (!sow) throw new AppError(404, 'SOW not found');
  if (!isSelectableSowStatus(sow.status)) {
    throw new AppError(400, 'SOW must be Draft, Amendment Draft, Signed, or Active before ' + actionLabel);
  }
  if (Number(sow.client_id) === Number(clientId)) return sow;

  const hasExistingLink = await SOWModel.hasClientLink(sowId, clientId);
  if (hasExistingLink) return sow;

  throw new AppError(400, 'SOW belongs to a different client');
}

async function validatePurchaseOrderForSow(poId, clientId, sowId) {
  const po = await POModel.findById(poId);
  if (!po) throw new AppError(404, 'Purchase order not found');
  if (Number(po.client_id) !== Number(clientId)) {
    throw new AppError(400, 'Purchase order belongs to a different client');
  }
  if (po.status !== 'Active') {
    throw new AppError(400, 'Purchase order must be Active to assign employees. Current status: ' + po.status);
  }
  if (Number(po.sow_id) !== Number(sowId)) {
    throw new AppError(400, 'Purchase order must be linked to the selected SOW');
  }
  return po;
}

function normalizeRateCardPayload(payload) {
  const copy = { ...payload };
  ['emp_code', 'emp_name', 'reporting_manager', 'service_description'].forEach((field) => {
    if (typeof copy[field] === 'string') copy[field] = copy[field].trim().toUpperCase();
  });
  return copy;
}

function normalizeComparableText(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDateKey(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function getSowWindowFromPayload(payload, sow, sowItem) {
  const windowStart = normalizeDateKey((sowItem && sowItem.valid_from) || sow.effective_start || payload.charging_date || payload.doj);
  const windowEnd = normalizeDateKey((sowItem && sowItem.valid_to) || sow.effective_end);
  const chargingDate = normalizeDateKey(payload.charging_date);
  const disableFrom = payload.disable_billing ? normalizeDateKey(payload.disable_from_date) : null;
  let start = windowStart;
  if (chargingDate && (!start || chargingDate > start)) start = chargingDate;
  let end = windowEnd;
  if (disableFrom && (!end || disableFrom <= end)) {
    const disabledDate = new Date(disableFrom);
    disabledDate.setDate(disabledDate.getDate() - 1);
    end = disabledDate.toISOString().slice(0, 10);
  }
  return { start, end };
}

function getSowWindowFromRow(row) {
  const windowStart = normalizeDateKey(row.sow_item_valid_from || row.charging_date || row.doj);
  const windowEnd = normalizeDateKey(row.sow_item_valid_to);
  const chargingDate = normalizeDateKey(row.charging_date);
  const disableFrom = row.disable_billing ? normalizeDateKey(row.disable_from_date) : null;
  let start = windowStart;
  if (chargingDate && (!start || chargingDate > start)) start = chargingDate;
  let end = windowEnd;
  if (disableFrom && (!end || disableFrom <= end)) {
    const disabledDate = new Date(disableFrom);
    disabledDate.setDate(disabledDate.getDate() - 1);
    end = disabledDate.toISOString().slice(0, 10);
  }
  return { start, end };
}

function windowsOverlap(a, b) {
  const aStart = a.start || '0000-01-01';
  const bStart = b.start || '0000-01-01';
  const aEnd = a.end || '9999-12-31';
  const bEnd = b.end || '9999-12-31';
  return aStart <= bEnd && bStart <= aEnd;
}

function formatWindow(window) {
  return `${window.start || 'open'} to ${window.end || 'open'}`;
}

async function validateEmployeeSowWindow(payload, sow, sowItem, excludeRateCardId, pendingRows = []) {
  if (payload.no_invoice || payload.billing_active === false || payload.disable_billing) return;
  const empCode = String(payload.emp_code || '').trim();
  const clientId = payload.client_id;
  if (!empCode || !clientId) return;
  const nextWindow = getSowWindowFromPayload(payload, sow, sowItem);
  if (nextWindow.start && nextWindow.end && nextWindow.start > nextWindow.end) {
    throw new AppError(400, 'Selected SOW/charging dates leave no billable days for this rate card');
  }

  const existingRows = await RateCardModel.findActiveByEmpClient(empCode, clientId);
  const conflicts = (existingRows || []).filter((row) => {
    if (excludeRateCardId && Number(row.id) === Number(excludeRateCardId)) return false;
    if (row.no_invoice || row.billing_active === false || row.disable_billing) return false;
    return windowsOverlap(nextWindow, getSowWindowFromRow(row));
  });
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    throw new AppError(400, `SOW billing window overlaps with existing rate card for ${empCode}: SOW ${conflict.sow_number || '-'} (${formatWindow(getSowWindowFromRow(conflict))}). New window is ${formatWindow(nextWindow)}.`);
  }

  const pendingConflicts = (pendingRows || []).filter((row) => {
    if (String(row.emp_code || '').trim().toUpperCase() !== empCode.toUpperCase()) return false;
    if (Number(row.client_id || clientId) !== Number(clientId)) return false;
    if (row.no_invoice || row.billing_active === false || row.disable_billing) return false;
    const rowWindow = {
      start: normalizeDateKey(row.sow_item_valid_from || row._sow_item_valid_from || row.charging_date || row.doj),
      end: normalizeDateKey(row.sow_item_valid_to || row._sow_item_valid_to),
    };
    return windowsOverlap(nextWindow, rowWindow);
  });
  if (pendingConflicts.length > 0) {
    throw new AppError(400, `Upload contains overlapping SOW windows for ${empCode}. New window is ${formatWindow(nextWindow)}.`);
  }

  payload._sow_item_valid_from = nextWindow.start;
  payload._sow_item_valid_to = nextWindow.end;
}

function resolveSowCapacityTarget(sow, serviceDescription, selectedSowItem) {
  if (selectedSowItem) {
    return {
      sowItemId: Number(selectedSowItem.id),
      serviceKey: normalizeComparableText(selectedSowItem.role_position || serviceDescription),
      allowedEmployees: Number(selectedSowItem.quantity) || 0,
      allowedAmount: Number(selectedSowItem.amount) || 0,
      label: `${selectedSowItem.role_position || serviceDescription} : ${Number(selectedSowItem.amount) || 0} : ${selectedSowItem.valid_from || 'open'} to ${selectedSowItem.valid_to || 'open'}`,
      scoped: true,
    };
  }
  const serviceKey = normalizeComparableText(serviceDescription);
  const items = sow.items || [];
  const matchedItem = serviceKey
    ? items.find((item) => normalizeComparableText(item.role_position) === serviceKey)
    : null;
  if (matchedItem) {
    return {
      sowItemId: Number(matchedItem.id),
      serviceKey,
      allowedEmployees: Number(matchedItem.quantity) || 0,
      allowedAmount: Number(matchedItem.amount) || 0,
      label: matchedItem.role_position || serviceDescription,
      scoped: true,
    };
  }
  return {
    serviceKey: '',
    allowedEmployees: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    allowedAmount: Number(sow.total_value || 0),
    label: sow.sow_number || 'selected SOW',
    scoped: false,
  };
}

function validateSowServiceDescription(sow, serviceDescription, sowItemId) {
  const items = sow.items || [];
  if (items.length === 0) return null;
  const serviceKey = normalizeComparableText(serviceDescription);
  if (!serviceKey) {
    throw new AppError(400, 'Select a SOW role/position as the service description');
  }
  const matchedItem = sowItemId
    ? items.find((item) => Number(item.id) === Number(sowItemId))
    : items.find((item) => normalizeComparableText(item.role_position) === serviceKey);
  if (!matchedItem) {
    throw new AppError(400, `Service description must match a role/position in SOW ${sow.sow_number}`);
  }
  if (normalizeComparableText(matchedItem.role_position) !== serviceKey) {
    throw new AppError(400, `Selected SOW role does not match service description for SOW ${sow.sow_number}`);
  }
  return matchedItem;
}

async function validateSowCapacity(sow, serviceDescription, monthlyRate, noInvoice, excludeRateCardId, selectedSowItem) {
  if (noInvoice) return;
  const target = resolveSowCapacityTarget(sow, serviceDescription, selectedSowItem);
  const allowedEmployees = target.allowedEmployees;
  if (!allowedEmployees) return;

  const rows = await RateCardModel.findAll();
  const linkedRows = (rows || []).filter((row) => {
    if (Number(row.sow_id) !== Number(sow.id)) return false;
    if (excludeRateCardId && Number(row.id) === Number(excludeRateCardId)) return false;
    if (row.no_invoice || row.billing_active === false || row.disable_billing) return false;
    if (target.scoped) {
      if (target.sowItemId && row.sow_item_id) return Number(row.sow_item_id) === target.sowItemId;
      if (target.sowItemId && !row.sow_item_id) {
        return normalizeComparableText(row.service_description) === target.serviceKey
          && Number(row.monthly_rate || 0) === Number(target.allowedAmount || 0);
      }
      if (normalizeComparableText(row.service_description) !== target.serviceKey) return false;
    }
    return true;
  });
  if (allowedEmployees > 0 && linkedRows.length + 1 > allowedEmployees) {
    throw new AppError(400, `Rate card employee count exceeds SOW quantity for ${target.label}`);
  }
}

module.exports = rateCardController;
