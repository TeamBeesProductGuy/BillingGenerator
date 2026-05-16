const { adminSupabase } = require('../config/database');
const AdminApprovalModel = require('../models/adminApproval.model');
const catchAsync = require('../middleware/catchAsync');
const { AppError } = require('../middleware/errorHandler');
const {
  isAdminUser,
  executeApprovedRequest,
} = require('../services/adminApproval.service');
const { sendUserCredentialsEmail } = require('../services/graphMail.service');

function assertAdmin(req) {
  if (!isAdminUser(req.user)) {
    throw new AppError(403, 'Admin access required');
  }
}

async function countRows(table, filters) {
  let query = adminSupabase.from(table).select('id', { count: 'exact', head: true });
  (filters || []).forEach((filter) => {
    query = query.eq(filter[0], filter[1]);
  });
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

async function countRegisteredUsers() {
  const { data, error } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error(error.message);
  return data && typeof data.total === 'number'
    ? data.total
    : ((data && data.users) ? data.users.length : 0);
}

function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = 'Tb@';
  for (let i = 0; i < 11; i += 1) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password + '7';
}

function normalizeUser(user) {
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email,
    name: meta.full_name || meta.name || '',
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    email_confirmed_at: user.email_confirmed_at,
  };
}

function getLoginUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host');
  return host ? `${proto}://${host}/signin` : '';
}

async function resolveClientAbbreviation(request) {
  if (!request.client_id) return request.client_name || '';
  try {
    const { data, error } = await adminSupabase
      .from('clients')
      .select('abbreviation, client_name')
      .eq('id', request.client_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.abbreviation || data.client_name || request.client_name || '') : (request.client_name || '');
  } catch (_err) {
    return request.client_name || '';
  }
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

async function resolveRoleDescription(request) {
  if (request.role_description) return request.role_description;
  const entityId = Number(request.entity_id);
  if (!entityId) return '';

  try {
    if (request.entity_type === 'quote') {
      const { data, error } = await adminSupabase
        .from('quote_items')
        .select('description')
        .eq('quote_id', entityId)
        .order('id');
      if (error) throw new Error(error.message);
      return joinDescriptions((data || []).map((item) => item.description));
    }

    if (request.entity_type === 'sow') {
      const { data, error } = await adminSupabase
        .from('sow_items')
        .select('role_position')
        .eq('sow_id', entityId)
        .order('id');
      if (error) throw new Error(error.message);
      return joinDescriptions((data || []).map((item) => item.role_position));
    }

    if (request.entity_type === 'rate_card') {
      const { data, error } = await adminSupabase
        .from('rate_cards_view')
        .select('*')
        .eq('id', entityId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? (data.service_description || data.sow_item_role_position || '') : '';
    }

    if (request.entity_type === 'purchase_order') {
      const { data: po, error: poError } = await adminSupabase
        .from('purchase_orders_view')
        .select('*')
        .eq('id', entityId)
        .maybeSingle();
      if (poError) throw new Error(poError.message);
      if (!po) return '';
      if (po.role_summary) return po.role_summary;
      if (!po.sow_id) return po.candidate_name || '';

      const { data: items, error: itemError } = await adminSupabase
        .from('sow_items')
        .select('role_position')
        .eq('sow_id', po.sow_id)
        .order('id');
      if (itemError) throw new Error(itemError.message);
      return joinDescriptions((items || []).map((item) => item.role_position)) || po.candidate_name || '';
    }
  } catch (_err) {
    return '';
  }

  return '';
}

async function enrichApprovalRoleDescriptions(requests) {
  return Promise.all((requests || []).map(async (request) => ({
    ...request,
    client_name: await resolveClientAbbreviation(request),
    role_description: request.role_description || await resolveRoleDescription(request),
  })));
}

const adminController = {
  stats: catchAsync(async (req, res) => {
    assertAdmin(req);
    const [clients, employees, users] = await Promise.all([
      countRows('clients', [['is_active', true]]),
      countRows('rate_cards', [['is_active', true]]),
      countRegisteredUsers(),
    ]);
    res.json({ success: true, data: { counts: { clients, employees, users } } });
  }),

  listApprovals: catchAsync(async (req, res) => {
    assertAdmin(req);
    const requests = await AdminApprovalModel.findAll({
      status: req.query.status,
      module: req.query.module,
    });
    res.json({ success: true, data: await enrichApprovalRoleDescriptions(requests) });
  }),

  listUsers: catchAsync(async (req, res) => {
    assertAdmin(req);
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const users = (data.users || []).map(normalizeUser)
      .sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
    res.json({ success: true, data: users });
  }),

  createUser: catchAsync(async (req, res) => {
    assertAdmin(req);
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const sendCredentials = req.body.sendCredentials !== false;
    const password = String(req.body.password || '').trim() || generateTemporaryPassword();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError(400, 'Valid email is required');
    }
    if (password.length < 8) {
      throw new AppError(400, 'Password must be at least 8 characters');
    }

    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
      },
    });
    if (error) throw new Error(error.message);

    let mailStatus = 'not_sent';
    let mailError = null;
    if (sendCredentials) {
      try {
        await sendUserCredentialsEmail({
          email,
          name,
          password,
          loginUrl: getLoginUrl(req),
        });
        mailStatus = 'sent';
      } catch (err) {
        mailStatus = 'failed';
        mailError = err.message;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        user: normalizeUser(data.user),
        temporaryPassword: mailStatus === 'sent' ? null : password,
        mailStatus,
        mailError,
      },
    });
  }),

  deleteUser: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    if (id === req.user.id) throw new AppError(400, 'Admin cannot delete the currently signed-in account');

    const { error } = await adminSupabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { message: 'User deleted' } });
  }),

  myApprovals: catchAsync(async (req, res) => {
    const requests = await AdminApprovalModel.findAll({
      mine: true,
      userId: req.user.id,
      status: req.query.status,
    });
    res.json({ success: true, data: requests });
  }),

  approve: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    const request = await AdminApprovalModel.findById(id);
    if (!request) throw new AppError(404, 'Approval request not found');
    if (request.status !== 'Pending') throw new AppError(400, 'Only pending requests can be approved');

    const result = await executeApprovedRequest(req, request);
    const updated = await AdminApprovalModel.updateStatus(id, 'Approved', req.user);
    res.json({ success: true, data: { request: updated, result } });
  }),

  reject: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    const request = await AdminApprovalModel.findById(id);
    if (!request) throw new AppError(404, 'Approval request not found');
    if (request.status !== 'Pending') throw new AppError(400, 'Only pending requests can be rejected');

    const updated = await AdminApprovalModel.updateStatus(id, 'Rejected', req.user);
    res.json({ success: true, data: { request: updated } });
  }),
};

module.exports = adminController;
