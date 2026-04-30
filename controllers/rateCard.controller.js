const fs = require('fs');
const ExcelJS = require('exceljs');
const RateCardModel = require('../models/rateCard.model');
const ClientModel = require('../models/client.model');
const POModel = require('../models/purchaseOrder.model');
const SOWModel = require('../models/sow.model');
const { parseRateCard } = require('../services/excelParser.service');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

function isSelectableSowStatus(status) {
  return ['Draft', 'Amendment Draft', 'Signed', 'Active'].includes(status);
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

    const sow = await SOWModel.findById(sow_id);
    if (!sow) throw new AppError(404, 'SOW not found');
    if (sow.client_id !== client_id) throw new AppError(400, 'SOW belongs to a different client');
    if (!isSelectableSowStatus(sow.status)) {
      throw new AppError(400, 'SOW must be Draft, Amendment Draft, or Signed before creating a Rate Card');
    }
    validateRateCardDates(doj, charging_date);
    validateBillingWindowDates(payload);
    validateSowServiceDescription(sow, service_description);
    await validateSowCapacity(sow, service_description, monthly_rate, no_invoice || disable_billing, null);

    if (po_id) {
      const po = await POModel.findById(po_id);
      if (!po) throw new AppError(404, 'Purchase order not found');
      if (po.client_id !== client_id) throw new AppError(400, 'Purchase order belongs to a different client');
      if (po.status !== 'Active') throw new AppError(400, 'Purchase order must be Active to assign employees. Current status: ' + po.status);
    }

    try {
      const id = await RateCardModel.create({
        client_id,
        emp_code,
        emp_name,
        doj,
        reporting_manager,
        service_description,
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
        throw new AppError(409, 'Employee code already exists for this client');
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
    const sow = await SOWModel.findById(sowId);
    if (!sow) throw new AppError(404, 'SOW not found');
    if (sow.client_id !== clientId) throw new AppError(400, 'SOW belongs to a different client');
    if (!isSelectableSowStatus(sow.status)) {
      throw new AppError(400, 'SOW must be Draft, Amendment Draft, or Signed before linking a Rate Card');
    }
    validateRateCardDates(payload.doj, payload.charging_date);
    validateBillingWindowDates(payload);
    validateSowServiceDescription(sow, payload.service_description || existing.service_description);
    await validateSowCapacity(
      sow,
      payload.service_description || existing.service_description,
      payload.monthly_rate || existing.monthly_rate,
      payload.no_invoice || payload.disable_billing,
      id
    );

    // Validate PO if provided
    if (payload.po_id) {
      const po = await POModel.findById(payload.po_id);
      if (!po) throw new AppError(404, 'Purchase order not found');
      if (po.client_id !== clientId) throw new AppError(400, 'Purchase order belongs to a different client');
      if (po.status !== 'Active') throw new AppError(400, 'Purchase order must be Active. Current status: ' + po.status);
    }

    try {
      await RateCardModel.update(id, payload);
      res.json({ success: true, data: { id } });
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))) {
        throw new AppError(409, 'Employee code already exists for this client');
      }
      throw err;
    }
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await RateCardModel.findById(id);
    if (!existing) throw new AppError(404, 'Rate card not found');
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

      const sowList = await SOWModel.findAll(clientId, null);
      const sowMap = new Map(sowList.map((sow) => [sow.sow_number, sow.id]));
      const sowById = new Map(sowList.map((sow) => [sow.id, sow]));
      const poList = await POModel.findAll(clientId, 'Active');
      const poMap = new Map(poList.map((po) => [po.po_number, po.id]));
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
          validateRateCardDates(r.doj, r.charging_date);
          validateBillingWindowDates(r);
          validateSowServiceDescription(sow, r.service_description);
          await validateSowCapacity(sow, r.service_description, r.monthly_rate, r.no_invoice || r.disable_billing, null);
        } catch (err) {
          errors.push({ emp_code: r.emp_code, error_message: err.message || 'Rate card validation failed' });
          continue;
        }

        if (r.po_number) {
          const poId = poMap.get(r.po_number);
          if (!poId) {
            errors.push({ emp_code: r.emp_code, error_message: `PO number "${r.po_number}" not found or not Active for this client` });
            continue;
          }
          r.po_id = poId;
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

function resolveSowCapacityTarget(sow, serviceDescription) {
  const serviceKey = normalizeComparableText(serviceDescription);
  const items = sow.items || [];
  const matchedItem = serviceKey
    ? items.find((item) => normalizeComparableText(item.role_position) === serviceKey)
    : null;
  if (matchedItem) {
    return {
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

function validateSowServiceDescription(sow, serviceDescription) {
  const items = sow.items || [];
  if (items.length === 0) return;
  const serviceKey = normalizeComparableText(serviceDescription);
  if (!serviceKey) {
    throw new AppError(400, 'Select a SOW role/position as the service description');
  }
  const matchedItem = items.find((item) => normalizeComparableText(item.role_position) === serviceKey);
  if (!matchedItem) {
    throw new AppError(400, `Service description must match a role/position in SOW ${sow.sow_number}`);
  }
}

async function validateSowCapacity(sow, serviceDescription, monthlyRate, noInvoice, excludeRateCardId) {
  if (noInvoice) return;
  const target = resolveSowCapacityTarget(sow, serviceDescription);
  const allowedEmployees = target.allowedEmployees;
  const allowedAmount = target.allowedAmount;
  if (!allowedEmployees && !allowedAmount) return;

  const rows = await RateCardModel.findAll(sow.client_id);
  const linkedRows = (rows || []).filter((row) => {
    if (Number(row.sow_id) !== Number(sow.id)) return false;
    if (excludeRateCardId && Number(row.id) === Number(excludeRateCardId)) return false;
    if (row.no_invoice || row.billing_active === false || row.disable_billing) return false;
    if (target.scoped && normalizeComparableText(row.service_description) !== target.serviceKey) return false;
    return true;
  });
  if (allowedEmployees > 0 && linkedRows.length + 1 > allowedEmployees) {
    throw new AppError(400, `Rate card employee count exceeds SOW quantity for ${target.label}`);
  }
  const usedAmount = linkedRows.reduce((sum, row) => sum + (Number(row.monthly_rate) || 0), 0);
  if (allowedAmount > 0 && usedAmount + Number(monthlyRate || 0) > allowedAmount) {
    throw new AppError(400, `Rate card amount exceeds SOW amount for ${target.label}`);
  }
}

module.exports = rateCardController;
