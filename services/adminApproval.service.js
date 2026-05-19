const AdminApprovalModel = require('../models/adminApproval.model');
const RateCardModel = require('../models/rateCard.model');
const QuoteModel = require('../models/quote.model');
const SOWModel = require('../models/sow.model');
const POModel = require('../models/purchaseOrder.model');
const ClientModel = require('../models/client.model');
const { AppError } = require('../middleware/errorHandler');
const { adminSupabase, runWithRequestClient } = require('../config/database');
const { logActivity } = require('./activityLog.service');

const ADMIN_EMAILS = ['jatinder@teambeescorp.com', 'jatinder@teambeescrop.com'];
const ADMIN_EMAIL = ADMIN_EMAILS[0];

function isAdminUser(user) {
  return ADMIN_EMAILS.includes(String(user && user.email ? user.email : '').trim().toLowerCase());
}

function requesterName(user) {
  if (!user) return '';
  const meta = user.user_metadata || {};
  return meta.full_name || meta.name || meta.display_name || user.email || '';
}

function approvalResponse(res, request) {
  return res.status(202).json({
    success: true,
    approvalRequired: true,
    data: {
      request,
      message: 'Your request has been sent to the admin for approval. This action will only be performed after confirmation.',
      status: 'Admin Approval Awaited',
    },
  });
}

async function createPendingRequest(req, res, entry) {
  const payload = {
    ...entry,
    requester_user_id: req.user.id,
    requester_email: req.user.email || null,
    requester_name: requesterName(req.user),
    status: 'Pending',
  };

  const existing = await AdminApprovalModel.findPendingDuplicate(payload);
  const request = existing || await AdminApprovalModel.create(payload);
  return approvalResponse(res, request);
}

async function requireAdminApproval(req, res, entry) {
  if (isAdminUser(req.user)) return false;
  await createPendingRequest(req, res, entry);
  return true;
}

async function getClientAbbreviation(clientId) {
  if (!clientId) return null;
  const client = await ClientModel.findById(clientId);
  return client ? (client.abbreviation || client.client_name || null) : null;
}

function buildMessage(user, actionText, moduleText, label) {
  const who = requesterName(user) || 'User';
  return `${who} requested ${actionText} action for ${moduleText} ${label}`;
}

function buildProfileChangeRequest(req, changes) {
  const payload = changes || {};
  const labels = [];
  if (payload.name !== undefined) labels.push('name');
  if (payload.email !== undefined) labels.push('email');
  if (payload.password !== undefined) labels.push('password');
  const actionLabel = labels.length ? `Change ${labels.join(', ')}` : 'Change Profile';
  const actionKey = payload.password !== undefined && labels.length === 1
    ? 'profile.password'
    : 'profile.update';
  return {
    module: 'profile',
    action_key: actionKey,
    action_label: actionLabel,
    entity_type: 'user_profile',
    entity_id: req.user.id,
    entity_label: req.user.email || req.user.id,
    client_id: null,
    client_name: 'Account',
    role_description: 'User profile',
    permission_message: buildMessage(req.user, actionLabel.toUpperCase(), 'User Profile', req.user.email || req.user.id),
    request_payload: {
      user_id: req.user.id,
      current_email: req.user.email || null,
      ...payload,
    },
  };
}

function joinDescriptions(values) {
  const seen = new Set();
  return (values || [])
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

async function buildRateCardDeleteRequest(req, rateCard) {
  const label = rateCard.emp_code || rateCard.emp_name || `#${rateCard.id}`;
  const clientName = await getClientAbbreviation(rateCard.client_id) || rateCard.client_name || null;
  return {
    module: 'rate_cards',
    action_key: 'rate_card.delete',
    action_label: 'Delete Rate Card',
    entity_type: 'rate_card',
    entity_id: rateCard.id,
    entity_label: label,
    client_id: rateCard.client_id,
    client_name: clientName,
    role_description: rateCard.service_description || rateCard.sow_item_role_position || null,
    permission_message: buildMessage(req.user, 'DELETE', 'Rate Card', `#${label}`),
    request_payload: { id: rateCard.id },
  };
}

async function buildQuoteDeleteRequest(req, quote) {
  const clientName = await getClientAbbreviation(quote.client_id) || quote.client_name || null;
  return {
    module: 'quotes',
    action_key: 'quote.delete',
    action_label: 'Delete Quote',
    entity_type: 'quote',
    entity_id: quote.id,
    entity_label: quote.quote_number,
    client_id: quote.client_id,
    client_name: clientName,
    role_description: joinDescriptions((quote.items || []).map((item) => item.description)),
    permission_message: buildMessage(req.user, 'DELETE', 'Quote', `#${quote.quote_number}`),
    request_payload: { id: quote.id },
  };
}

async function buildSowDeleteRequest(req, sow) {
  const clientName = await getClientAbbreviation(sow.client_id) || sow.client_name || null;
  return {
    module: 'sows',
    action_key: 'sow.delete',
    action_label: 'Delete SOW',
    entity_type: 'sow',
    entity_id: sow.id,
    entity_label: sow.sow_number,
    client_id: sow.client_id,
    client_name: clientName,
    role_description: joinDescriptions((sow.items || []).map((item) => item.role_position)) || sow.role_summary || null,
    permission_message: buildMessage(req.user, 'DELETE', 'SOW', `#${sow.sow_number}`),
    request_payload: { id: sow.id },
  };
}

async function buildSowStatusRequest(req, sow, status) {
  const clientName = await getClientAbbreviation(sow.client_id) || sow.client_name || null;
  return {
    module: 'sows',
    action_key: 'sow.status',
    action_label: `Mark SOW ${status}`,
    entity_type: 'sow',
    entity_id: sow.id,
    entity_label: sow.sow_number,
    client_id: sow.client_id,
    client_name: clientName,
    role_description: joinDescriptions((sow.items || []).map((item) => item.role_position)) || sow.role_summary || null,
    permission_message: buildMessage(req.user, status.toUpperCase() + ' status change', 'SOW', `#${sow.sow_number}`),
    request_payload: { id: sow.id, status, from_status: sow.status },
  };
}

async function buildPoStatusRequest(req, po, status) {
  const clientName = await getClientAbbreviation(po.client_id) || po.client_abbreviation || po.client_name || null;
  return {
    module: 'purchase_orders',
    action_key: 'po.status',
    action_label: `Mark PO ${status}`,
    entity_type: 'purchase_order',
    entity_id: po.id,
    entity_label: po.po_number,
    client_id: po.client_id,
    client_name: clientName,
    role_description: po.role_summary || po.candidate_name || null,
    permission_message: buildMessage(req.user, status.toUpperCase() + ' status change', 'PO', `#${po.po_number}`),
    request_payload: { id: po.id, status, from_status: po.status },
  };
}

async function buildPoRenewRequest(req, po, payload) {
  const clientName = await getClientAbbreviation(po.client_id) || po.client_abbreviation || po.client_name || null;
  return {
    module: 'purchase_orders',
    action_key: 'po.renew',
    action_label: 'Renew PO',
    entity_type: 'purchase_order',
    entity_id: po.id,
    entity_label: po.po_number,
    client_id: po.client_id,
    client_name: clientName,
    role_description: po.role_summary || po.candidate_name || null,
    permission_message: buildMessage(req.user, 'RENEW', 'PO', `#${po.po_number}`),
    request_payload: { id: po.id, ...payload },
  };
}

async function buildPoDeleteRequest(req, po) {
  const clientName = await getClientAbbreviation(po.client_id) || po.client_abbreviation || po.client_name || null;
  return {
    module: 'purchase_orders',
    action_key: 'po.delete',
    action_label: 'Delete PO',
    entity_type: 'purchase_order',
    entity_id: po.id,
    entity_label: po.po_number,
    client_id: po.client_id,
    client_name: clientName,
    role_description: po.role_summary || po.candidate_name || null,
    permission_message: buildMessage(req.user, 'DELETE', 'PO', `#${po.po_number}`),
    request_payload: { id: po.id },
  };
}

async function buildPoCrossClientCreateRequest(req, payload, sow) {
  const clientName = await getClientAbbreviation(payload.client_id) || null;
  const sourceClientName = await getClientAbbreviation(sow.client_id) || null;
  return {
    module: 'purchase_orders',
    action_key: 'po.cross_client_sow_create',
    action_label: 'Create PO With Cross-Client SOW',
    entity_type: 'purchase_order',
    entity_id: payload.po_number || 'new',
    entity_label: payload.po_number || 'New PO',
    client_id: payload.client_id,
    client_name: clientName,
    role_description: sow.sow_number || null,
    permission_message: buildMessage(
      req.user,
      'CREATE PO WITH CROSS-CLIENT SOW',
      'PO',
      `${payload.po_number || 'New PO'} using SOW #${sow.sow_number || sow.id} from ${sourceClientName || 'another client'}`
    ),
    request_payload: {
      ...payload,
      sow_owner_client_id: sow.client_id,
      sow_number: sow.sow_number || null,
    },
  };
}

async function executeApprovedRequest(req, request) {
  return runWithRequestClient(adminSupabase, async () => {
    const payload = request.request_payload || {};

    if (request.action_key === 'rate_card.delete') {
      const existing = await RateCardModel.findById(Number(request.entity_id));
      if (!existing) throw new AppError(404, 'Rate card not found');
      await RateCardModel.softDelete(Number(request.entity_id));
      await logActivity(req, {
        module: 'rate_cards',
        action: 'delete',
        entityType: 'rate_card',
        entityId: request.entity_id,
        entityLabel: request.entity_label,
        details: { summary: 'Admin approved and deleted rate card ' + request.entity_label, approval_request_id: request.id },
      });
      return { message: 'Rate card deleted' };
    }

    if (request.action_key === 'quote.delete') {
      const existing = await QuoteModel.findById(Number(request.entity_id));
      if (!existing) throw new AppError(404, 'Quote not found');
      await QuoteModel.delete(Number(request.entity_id));
      await logActivity(req, {
        module: 'quotes',
        action: 'delete',
        entityType: 'quote',
        entityId: request.entity_id,
        entityLabel: request.entity_label,
        details: { summary: 'Admin approved and deleted quote ' + request.entity_label, approval_request_id: request.id },
      });
      return { message: 'Quote deleted' };
    }

    if (request.action_key === 'sow.delete') {
      const existing = await SOWModel.findById(Number(request.entity_id));
      if (!existing) throw new AppError(404, 'SOW not found');
      await SOWModel.delete(Number(request.entity_id));
      await logActivity(req, {
        module: 'sows',
        action: 'delete',
        entityType: 'sow',
        entityId: request.entity_id,
        entityLabel: request.entity_label,
        details: { summary: 'Admin approved and deleted SOW ' + request.entity_label, approval_request_id: request.id },
      });
      return { message: 'SOW deleted' };
    }

    if (request.action_key === 'sow.status') {
      await SOWModel.updateStatus(Number(request.entity_id), payload.status);
      await logActivity(req, {
        module: 'sows',
        action: 'status_change',
        entityType: 'sow',
        entityId: request.entity_id,
        entityLabel: request.entity_label,
        details: { summary: 'Admin approved SOW status change to ' + payload.status, approval_request_id: request.id },
      });
      return { id: request.entity_id, status: payload.status };
    }

    if (request.action_key === 'po.status') {
      await POModel.updateStatus(Number(request.entity_id), payload.status);
      await logActivity(req, {
        module: 'purchase_orders',
        action: 'status_change',
        entityType: 'purchase_order',
        entityId: request.entity_id,
        entityLabel: request.entity_label,
        details: { summary: 'Admin approved PO status change to ' + payload.status, approval_request_id: request.id },
      });
      return { id: request.entity_id, status: payload.status };
    }

    if (request.action_key === 'po.delete') {
      const po = await POModel.findById(Number(request.entity_id));
      if (!po) throw new AppError(404, 'Purchase order not found');
      await POModel.delete(Number(request.entity_id));
      await logActivity(req, {
        module: 'purchase_orders',
        action: 'delete',
        entityType: 'purchase_order',
        entityId: request.entity_id,
        entityLabel: request.entity_label,
        details: { summary: 'Admin approved and deleted PO ' + request.entity_label, approval_request_id: request.id },
      });
      return { message: 'Purchase order deleted' };
    }

    if (request.action_key === 'po.renew') {
      const po = await POModel.findById(Number(request.entity_id));
      if (!po) throw new AppError(404, 'Purchase order not found');
      const newPoId = await POModel.renew(Number(request.entity_id), {
        po_number: payload.po_number,
        client_id: po.client_id,
        po_date: payload.po_date,
        start_date: payload.start_date,
        end_date: payload.end_date,
        po_value: payload.po_value,
        alert_threshold: payload.alert_threshold,
        notes: payload.notes,
        sow_id: po.sow_id,
      });
      await logActivity(req, {
        module: 'purchase_orders',
        action: 'renew',
        entityType: 'purchase_order',
        entityId: newPoId,
        entityLabel: payload.po_number,
        details: { summary: 'Admin approved PO renewal ' + request.entity_label + ' as ' + payload.po_number, approval_request_id: request.id },
      });
      return { oldPoId: request.entity_id, newPoId, po_number: payload.po_number };
    }

    if (request.action_key === 'po.cross_client_sow_create') {
      const sow = await SOWModel.findById(Number(payload.sow_id));
      if (!sow) throw new AppError(404, 'SOW not found');
      await SOWModel.ensureClientLink(Number(payload.sow_id), Number(payload.client_id));
      const result = await POModel.create({
        po_number: payload.po_number,
        client_id: payload.client_id,
        po_date: payload.po_date,
        start_date: payload.start_date,
        end_date: payload.end_date,
        po_value: payload.po_value,
        alert_threshold: payload.alert_threshold,
        sow_id: payload.sow_id,
        notes: payload.notes,
      });
      await logActivity(req, {
        module: 'purchase_orders',
        action: 'create',
        entityType: 'purchase_order',
        entityId: result.id,
        entityLabel: result.po_number,
        details: { summary: 'Admin approved cross-client SOW PO creation ' + result.po_number, approval_request_id: request.id },
      });
      return { id: result.id, po_number: result.po_number };
    }

    if (request.action_key === 'profile.update' || request.action_key === 'profile.password') {
      const userId = payload.user_id || request.entity_id;
      const { data: existing, error: existingError } = await adminSupabase.auth.admin.getUserById(userId);
      if (existingError) throw new Error(existingError.message);
      if (!existing || !existing.user) throw new AppError(404, 'User not found');

      const currentMeta = existing.user.user_metadata || {};
      const nextMeta = { ...currentMeta };
      const update = {};
      if (payload.name !== undefined) {
        nextMeta.full_name = String(payload.name || '').trim();
        nextMeta.name = nextMeta.full_name;
        update.user_metadata = nextMeta;
      }
      if (payload.email !== undefined) {
        update.email = String(payload.email || '').trim().toLowerCase();
        update.email_confirm = true;
      }
      if (payload.password !== undefined) {
        update.password = String(payload.password || '');
        nextMeta.password_changed_once = true;
        update.user_metadata = nextMeta;
      }

      const { data, error } = await adminSupabase.auth.admin.updateUserById(userId, update);
      if (error) throw new Error(error.message);
      await logActivity(req, {
        module: 'profile',
        action: 'update',
        entityType: 'user_profile',
        entityId: userId,
        entityLabel: payload.email || payload.current_email || request.entity_label,
        details: { summary: 'Admin approved profile update for ' + (payload.current_email || request.entity_label), approval_request_id: request.id },
      });
      return { user: data.user ? { id: data.user.id, email: data.user.email } : null };
    }

    throw new AppError(400, 'Unsupported approval action: ' + request.action_key);
  });
}

module.exports = {
  ADMIN_EMAIL,
  isAdminUser,
  requireAdminApproval,
  buildRateCardDeleteRequest,
  buildQuoteDeleteRequest,
  buildSowDeleteRequest,
  buildSowStatusRequest,
  buildPoStatusRequest,
  buildPoRenewRequest,
  buildPoDeleteRequest,
  buildPoCrossClientCreateRequest,
  buildProfileChangeRequest,
  executeApprovedRequest,
};
