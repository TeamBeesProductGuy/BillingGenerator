const POModel = require('../models/purchaseOrder.model');
const RateCardModel = require('../models/rateCard.model');
const SOWModel = require('../models/sow.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');
const { logActivity } = require('../services/activityLog.service');
const {
  requireAdminApproval,
  buildPoStatusRequest,
  buildPoRenewRequest,
  buildPoDeleteRequest,
  buildPoCrossClientCreateRequest,
} = require('../services/adminApproval.service');
const {
  filterAllowedContractualClientId,
  filterAllowedContractualClientIdForAny,
  requireContractualClientAccess,
  requireContractualClientReadAccess,
} = require('../services/permissionAccess.service');

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

async function needsCrossClientSowApproval(clientId, sowId) {
  if (!sowId) return null;
  const sow = await SOWModel.findById(sowId);
  if (!sow) throw new AppError(404, 'SOW not found');
  if (!isLinkableSowStatus(sow.status)) {
    throw new AppError(400, 'SOW cannot be linked to a PO in its current status: ' + sow.status);
  }
  if (Number(sow.client_id) === Number(clientId)) return null;
  const hasExistingLink = await SOWModel.hasClientLink(sowId, clientId);
  return hasExistingLink ? null : sow;
}

const poController = {
  list: catchAsync(async (req, res) => {
    const { clientId, status, sowId } = req.query;
    const parsedClientId = clientId ? parseInt(clientId, 10) : null;
    const allowedClientIds = await filterAllowedContractualClientIdForAny(req.user, ['purchase_orders', 'rate_cards', 'billing'], parsedClientId);
    if (allowedClientIds.length === 0) return res.json({ success: true, data: [] });
    const orders = await POModel.findAll(
      allowedClientIds,
      status,
      { sowId: sowId ? parseInt(sowId, 10) : null }
    );
    res.json({ success: true, data: orders });
  }),

  getById: catchAsync(async (req, res) => {
    const po = await POModel.findById(parseInt(req.params.id, 10));
    if (!po) throw new AppError(404, 'Purchase order not found');
    await requireContractualClientReadAccess(req, ['purchase_orders', 'rate_cards', 'billing'], po.client_id);
    po.linkedEmployees = await RateCardModel.findByPoId(po.id);
    res.json({ success: true, data: po });
  }),

  getLinkedEmployees: catchAsync(async (req, res) => {
    const poId = parseInt(req.params.id, 10);
    const po = await POModel.findById(poId);
    if (!po) throw new AppError(404, 'Purchase order not found');
    await requireContractualClientReadAccess(req, ['purchase_orders', 'rate_cards', 'billing'], po.client_id);
    const employees = await RateCardModel.findByPoId(poId);
    res.json({ success: true, data: employees });
  }),

  create: catchAsync(async (req, res) => {
    const { po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, sow_id, sow_source_client_id, notes } = req.body;
    await requireContractualClientAccess(req, 'purchase_orders', client_id);
    const crossClientSow = await needsCrossClientSowApproval(client_id, sow_id);
    if (crossClientSow && await requireAdminApproval(req, res, await buildPoCrossClientCreateRequest(req, {
      po_number,
      client_id,
      po_date,
      start_date,
      end_date,
      po_value,
      alert_threshold,
      sow_id,
      sow_source_client_id,
      notes,
    }, crossClientSow))) return;

    await validateSowForClient(client_id, sow_id, sow_source_client_id || null);

    try {
      const result = await POModel.create({ po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, sow_id, notes });
      await logActivity(req, {
        module: 'purchase_orders',
        action: 'create',
        entityType: 'purchase_order',
        entityId: result.id,
        entityLabel: result.po_number,
        details: { summary: 'Created purchase order ' + result.po_number },
      });
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
    await requireContractualClientAccess(req, 'purchase_orders', existing.client_id);

    // Validate SOW if provided
    if (req.body.sow_id) {
      await validateSowForClient(req.body.client_id, req.body.sow_id, req.body.sow_source_client_id || null);
    }

    await POModel.update(id, req.body);
    const updated = await POModel.findById(id);
    await logActivity(req, {
      module: 'purchase_orders',
      action: 'update',
      entityType: 'purchase_order',
      entityId: id,
      entityLabel: updated ? updated.po_number : 'PO #' + id,
      details: { summary: 'Updated purchase order ' + (updated ? updated.po_number : id) },
    });
    res.json({ success: true, data: { id } });
  }),

  recordConsumption: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { amount, description, billingRunId } = req.body;
    if (!amount || amount <= 0) throw new AppError(400, 'amount must be a positive number');

    const po = await POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    await requireContractualClientReadAccess(req, ['purchase_orders', 'rate_cards', 'billing'], po.client_id);
    if (po.status !== 'Active') throw new AppError(400, 'Can only consume from active POs');

    await POModel.addConsumption(id, amount, description, billingRunId);
    const updated = await POModel.findById(id);
    await logActivity(req, {
      module: 'purchase_orders',
      action: 'record_consumption',
      entityType: 'purchase_order',
      entityId: id,
      entityLabel: updated.po_number,
      details: { summary: 'Recorded PO consumption of ' + amount, amount, description: description || null },
    });
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
    await requireContractualClientAccess(req, 'purchase_orders', po.client_id);

    const { po_number, po_date, start_date, end_date, po_value, alert_threshold, notes } = req.body;
    if (await requireAdminApproval(req, res, await buildPoRenewRequest(req, po, {
      po_number, po_date, start_date, end_date, po_value, alert_threshold, notes,
    }))) return;

    const newPoId = await POModel.renew(id, {
      po_number, client_id: po.client_id, po_date, start_date, end_date,
      po_value, alert_threshold, notes, sow_id: po.sow_id,
    });
    await logActivity(req, {
      module: 'purchase_orders',
      action: 'renew',
      entityType: 'purchase_order',
      entityId: newPoId,
      entityLabel: po_number,
      details: { summary: 'Renewed purchase order ' + po.po_number + ' as ' + po_number },
    });
    res.json({ success: true, data: { oldPoId: id, newPoId, po_number } });
  }),

  updateStatus: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const po = await POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    await requireContractualClientAccess(req, 'purchase_orders', po.client_id);

    const allowed = {
      Active: ['Inactive', 'Expired', 'Exhausted', 'Renewed', 'Cancelled'],
      Inactive: ['Active'],
      Expired: ['Inactive'],
      Exhausted: ['Inactive'],
      Renewed: [],
      Cancelled: [],
    };
    if (!(allowed[po.status] || []).includes(status)) {
      throw new AppError(400, `Cannot change PO status from "${po.status}" to "${status}".`);
    }
    if (status === 'Active' || status === 'Inactive') {
      if (await requireAdminApproval(req, res, await buildPoStatusRequest(req, po, status))) return;
    }

    await POModel.updateStatus(id, status);
    await logActivity(req, {
      module: 'purchase_orders',
      action: 'status_change',
      entityType: 'purchase_order',
      entityId: id,
      entityLabel: po.po_number,
      details: { summary: 'Changed purchase order status to ' + status, from: po.status, to: status },
    });
    res.json({ success: true, data: { id, status } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const po = await POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    await requireContractualClientAccess(req, 'purchase_orders', po.client_id);
    if (await requireAdminApproval(req, res, await buildPoDeleteRequest(req, po))) return;
    await POModel.delete(id);
    await logActivity(req, {
      module: 'purchase_orders',
      action: 'delete',
      entityType: 'purchase_order',
      entityId: id,
      entityLabel: po.po_number,
      details: { summary: 'Deleted purchase order ' + po.po_number },
    });
    res.json({ success: true, data: { message: 'Purchase order deleted' } });
  }),

  getAssociations: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const po = await POModel.findById(id);
    if (!po) throw new AppError(404, 'Purchase order not found');
    await requireContractualClientAccess(req, 'purchase_orders', po.client_id);
    const associations = await POModel.getAssociations(id);
    res.json({ success: true, data: associations });
  }),
};

module.exports = poController;
