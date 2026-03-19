const fs = require('fs');
const ExcelJS = require('exceljs');
const RateCardModel = require('../models/rateCard.model');
const ClientModel = require('../models/client.model');
const POModel = require('../models/purchaseOrder.model');
const { parseRateCard } = require('../services/excelParser.service');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

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
    const { client_id, emp_code, emp_name, doj, reporting_manager, monthly_rate, leaves_allowed, date_of_reporting, po_id } = req.body;

    // Validate PO exists, belongs to same client, and is Active
    const po = await POModel.findById(po_id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (po.client_id !== client_id) throw new AppError(400, 'Purchase order belongs to a different client');
    if (po.status !== 'Active') throw new AppError(400, 'Purchase order must be Active to assign employees. Current status: ' + po.status);

    try {
      const id = await RateCardModel.create({ client_id, emp_code, emp_name, doj, reporting_manager, monthly_rate, leaves_allowed, date_of_reporting, po_id });
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

    // Validate PO if provided
    if (req.body.po_id) {
      const po = await POModel.findById(req.body.po_id);
      if (!po) throw new AppError(404, 'Purchase order not found');
      const clientId = req.body.client_id || existing.client_id;
      if (po.client_id !== clientId) throw new AppError(400, 'Purchase order belongs to a different client');
      if (po.status !== 'Active') throw new AppError(400, 'Purchase order must be Active. Current status: ' + po.status);
    }

    await RateCardModel.update(id, req.body);
    res.json({ success: true, data: { id } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await RateCardModel.findById(id);
    if (!existing) throw new AppError(404, 'Rate card not found');
    await RateCardModel.softDelete(id);
    res.json({ success: true, data: { message: 'Rate card deleted' } });
  }),

  uploadExcel: catchAsync(async (req, res) => {
    if (!req.file) throw new AppError(400, 'Excel file is required');
    const clientId = parseInt(req.body.clientId, 10);
    if (!clientId) throw new AppError(400, 'clientId is required');

    const client = await ClientModel.findById(clientId);
    if (!client) throw new AppError(404, 'Client not found');

    try {
      const { records, errors } = await parseRateCard(req.file.path);

      // Resolve po_number to po_id — po_number is required
      const poList = await POModel.findAll(clientId, 'Active');
      const poMap = new Map(poList.map((po) => [po.po_number, po.id]));
      const validRecords = [];
      for (const r of records) {
        if (!r.po_number) {
          errors.push({ emp_code: r.emp_code, error_message: 'Missing po_number. A PO is required for every employee.' });
          continue;
        }
        const poId = poMap.get(r.po_number);
        if (poId) {
          r.po_id = poId;
          validRecords.push(r);
        } else {
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
      { header: 'Date of Reporting', key: 'date_of_reporting', width: 15 },
      { header: 'PO Number', key: 'po_number', width: 18 },
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

module.exports = rateCardController;
