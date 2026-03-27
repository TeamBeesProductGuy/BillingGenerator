const SOWModel = require('../models/sow.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

function isEditableStatus(status) {
  return status === 'Draft' || status === 'Amendment Draft';
}

const sowController = {
  list: catchAsync(async (req, res) => {
    const { clientId, status } = req.query;
    const sows = await SOWModel.findAll(clientId ? parseInt(clientId, 10) : null, status);
    res.json({ success: true, data: sows });
  }),

  getById: catchAsync(async (req, res) => {
    const sow = await SOWModel.findById(parseInt(req.params.id, 10));
    if (!sow) throw new AppError(404, 'SOW not found');
    res.json({ success: true, data: sow });
  }),

  create: catchAsync(async (req, res) => {
    const { sow_number, client_id, quote_id, sow_date, effective_start, effective_end, notes, items } = req.body;
    const result = await SOWModel.create({ sow_number, client_id, quote_id, sow_date, effective_start, effective_end, notes }, items);
    res.status(201).json({ success: true, data: result });
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');
    if (!isEditableStatus(existing.status)) throw new AppError(400, 'Only Draft or Amendment Draft SOWs can be edited');
    const { client_id, quote_id, sow_date, effective_start, effective_end, notes, items } = req.body;
    const result = await SOWModel.update(id, { client_id, quote_id, sow_date, effective_start, effective_end, notes }, items || []);
    res.json({ success: true, data: { id: result.id, sow_number: result.sow_number, replaced_sow_id: id } });
  }),

  amend: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');
    if (existing.status !== 'Signed') throw new AppError(400, 'Only signed SOWs can be amended');

    const { client_id, quote_id, sow_date, effective_start, effective_end, notes, items } = req.body;
    const result = await SOWModel.createAmendment(id, { client_id, quote_id, sow_date, effective_start, effective_end, notes }, items || []);
    res.status(201).json({ success: true, data: { id: result.id, sow_number: result.sow_number, amended_from_sow_id: id, status: 'Amendment Draft' } });
  }),

  updateStatus: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');

    const VALID_TRANSITIONS = {
      Draft: ['Signed'],
      'Amendment Draft': ['Signed'],
      Signed: ['Expired', 'Terminated'],
      Expired: [],
      Terminated: [],
    };
    const allowed = VALID_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status)) {
      throw new AppError(400, `Cannot change status from "${existing.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`);
    }

    await SOWModel.updateStatus(id, status);
    res.json({ success: true, data: { id, status } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');
    if (!isEditableStatus(existing.status)) throw new AppError(400, 'Only Draft or Amendment Draft SOWs can be deleted');
    await SOWModel.delete(id);
    res.json({ success: true, data: { message: 'SOW deleted' } });
  }),
};

module.exports = sowController;
