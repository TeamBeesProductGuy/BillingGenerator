const POModel = require('../models/purchaseOrder.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const poController = {
  list: catchAsync(async (req, res) => {
    const { clientId, status } = req.query;
    const orders = POModel.findAll(clientId ? parseInt(clientId, 10) : null, status);
    res.json({ success: true, data: orders });
  }),

  getById: catchAsync(async (req, res) => {
    const po = POModel.findById(parseInt(req.params.id, 10));
    if (!po) throw new AppError(404, 'Purchase order not found');
    res.json({ success: true, data: po });
  }),

  create: catchAsync(async (req, res) => {
    try {
      const { po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, notes } = req.body;
      const id = POModel.create({ po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, notes });
      res.status(201).json({ success: true, data: { id, po_number } });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        throw new AppError(409, 'PO number already exists');
      }
      throw err;
    }
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = POModel.findById(id);
    if (!existing) throw new AppError(404, 'Purchase order not found');
    POModel.update(id, req.body);
    res.json({ success: true, data: { id } });
  }),

  recordConsumption: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { amount, description, billingRunId } = req.body;
    if (!amount || amount <= 0) throw new AppError(400, 'amount must be a positive number');

    const po = POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (po.status !== 'Active') throw new AppError(400, 'Can only consume from active POs');

    POModel.addConsumption(id, amount, description, billingRunId);
    const updated = POModel.findById(id);
    res.json({ success: true, data: updated });
  }),

  getAlerts: catchAsync(async (req, res) => {
    const alerts = POModel.getAlerts();
    res.json({ success: true, data: alerts });
  }),

  renew: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const po = POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');

    const { po_number, po_date, start_date, end_date, po_value, alert_threshold, notes } = req.body;

    const newPoId = POModel.renew(id, {
      po_number, client_id: po.client_id, po_date, start_date, end_date,
      po_value, alert_threshold, notes,
    });
    res.json({ success: true, data: { oldPoId: id, newPoId, po_number } });
  }),
};

module.exports = poController;
