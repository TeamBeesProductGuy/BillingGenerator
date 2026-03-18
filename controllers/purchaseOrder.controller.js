const POModel = require('../models/purchaseOrder.model');
const RateCardModel = require('../models/rateCard.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const poController = {
  list: catchAsync(async (req, res) => {
    const { clientId, status } = req.query;
    const orders = await POModel.findAll(clientId ? parseInt(clientId, 10) : null, status);
    res.json({ success: true, data: orders });
  }),

  getById: catchAsync(async (req, res) => {
    const po = await POModel.findById(parseInt(req.params.id, 10));
    if (!po) throw new AppError(404, 'Purchase order not found');
    po.linkedEmployees = await RateCardModel.findByPoId(po.id);
    res.json({ success: true, data: po });
  }),

  getLinkedEmployees: catchAsync(async (req, res) => {
    const poId = parseInt(req.params.id, 10);
    const po = await POModel.findById(poId);
    if (!po) throw new AppError(404, 'Purchase order not found');
    const employees = await RateCardModel.findByPoId(poId);
    res.json({ success: true, data: employees });
  }),

  create: catchAsync(async (req, res) => {
    try {
      const { po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, sow_id, notes } = req.body;
      const id = await POModel.create({ po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, sow_id, notes });
      res.status(201).json({ success: true, data: { id, po_number } });
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))) {
        throw new AppError(409, 'PO number already exists');
      }
      throw err;
    }
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await POModel.findById(id);
    if (!existing) throw new AppError(404, 'Purchase order not found');
    await POModel.update(id, req.body);
    res.json({ success: true, data: { id } });
  }),

  recordConsumption: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { amount, description, billingRunId } = req.body;
    if (!amount || amount <= 0) throw new AppError(400, 'amount must be a positive number');

    const po = await POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (po.status !== 'Active') throw new AppError(400, 'Can only consume from active POs');

    await POModel.addConsumption(id, amount, description, billingRunId);
    const updated = await POModel.findById(id);
    res.json({ success: true, data: updated });
  }),

  getAlerts: catchAsync(async (req, res) => {
    const alerts = await POModel.getAlerts();
    res.json({ success: true, data: alerts });
  }),

  renew: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const po = await POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');

    const { po_number, po_date, start_date, end_date, po_value, alert_threshold, notes } = req.body;

    const newPoId = await POModel.renew(id, {
      po_number, client_id: po.client_id, po_date, start_date, end_date,
      po_value, alert_threshold, notes,
    });
    res.json({ success: true, data: { oldPoId: id, newPoId, po_number } });
  }),
};

module.exports = poController;
