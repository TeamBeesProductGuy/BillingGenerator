const POModel = require('../models/purchaseOrder.model');
const RateCardModel = require('../models/rateCard.model');
const SOWModel = require('../models/sow.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

function isLinkableSowStatus(status) {
  return status === 'Draft' || status === 'Amendment Draft' || status === 'Signed' || status === 'Active';
}

async function validateSowForClient(clientId, sowId, sowSourceClientId) {
  const sow = await SOWModel.findById(sowId);
  if (!sow) throw new AppError(404, 'SOW not found');
  if (!isLinkableSowStatus(sow.status)) {
    throw new AppError(400, 'SOW cannot be linked to a PO in its current status: ' + sow.status);
  }

  if (sow.client_id === clientId) {
    return sow;
  }

  const hasExistingLink = await SOWModel.hasClientLink(sowId, clientId);
  if (hasExistingLink) {
    return sow;
  }

  if (!sowSourceClientId || sow.client_id !== sowSourceClientId) {
    throw new AppError(400, 'Choose the correct source SOW client before linking this SOW to another client branch.');
  }

  try {
    await SOWModel.ensureClientLink(sowId, clientId);
  } catch (err) {
    if (String(err.message || '').indexOf('sow_client_links table is missing') !== -1) {
      throw new AppError(400, 'Cross-client SOW linking is not enabled in the database yet. Run the Supabase SQL migration first.');
    }
    throw err;
  }
  return sow;
}

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
    const { po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, sow_id, sow_source_client_id, notes } = req.body;

    await validateSowForClient(client_id, sow_id, sow_source_client_id || null);

    try {
      const result = await POModel.create({ po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, sow_id, notes });
      res.status(201).json({ success: true, data: { id: result.id, po_number: result.po_number } });
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

    // Validate SOW if provided
    if (req.body.sow_id) {
      await validateSowForClient(req.body.client_id, req.body.sow_id, req.body.sow_source_client_id || null);
    }

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
      po_value, alert_threshold, notes, sow_id: po.sow_id,
    });
    res.json({ success: true, data: { oldPoId: id, newPoId, po_number } });
  }),
};

module.exports = poController;
