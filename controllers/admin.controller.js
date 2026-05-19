const { adminSupabase } = require('../config/database');
const AdminApprovalModel = require('../models/adminApproval.model');
const UserPermissionModel = require('../models/userPermission.model');
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
    password_changed_once: Boolean(meta.password_changed_once),
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    email_confirmed_at: user.email_confirmed_at,
  };
}

function normalizePermissions(value) {
  const input = value || {};
  const result = {};
  UserPermissionModel.modules.forEach((moduleKey) => {
    result[moduleKey] = input[moduleKey] === true;
  });
  return result;
}

function normalizeUserWithPermissions(user, permissionsByUser) {
  const normalized = normalizeUser(user);
  return {
    ...normalized,
    permissions: permissionsByUser && permissionsByUser[user.id]
      ? permissionsByUser[user.id]
      : normalizePermissions({}),
    client_permissions: {},
  };
}

function normalizeClientIdentity(client) {
  return String(client.abbreviation || client.client_name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function dedupeAdminClients(clients, clientType) {
  const byIdentity = new Map();
  (clients || []).forEach((client) => {
    const identity = normalizeClientIdentity(client);
    const key = `${clientType}:${identity || client.id}`;
    const existing = byIdentity.get(key);
    if (!existing || Number(client.id) < Number(existing.id)) {
      byIdentity.set(key, client);
    }
  });
  return Array.from(byIdentity.values())
    .sort((a, b) => String(a.abbreviation || a.client_name || '').localeCompare(String(b.abbreviation || b.client_name || '')))
    .map((client) => ({
      ...client,
      client_type: clientType,
      label: client.abbreviation || client.client_name || 'Client',
    }));
}

function redactApprovalPayload(request) {
  if (!request || !request.request_payload || request.action_key !== 'profile.password') return request;
  return {
    ...request,
    request_payload: {
      ...request.request_payload,
      password: request.request_payload.password ? '[redacted]' : request.request_payload.password,
    },
  };
}

function redactApprovalPayloads(requests) {
  return (requests || []).map(redactApprovalPayload);
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
  } catch {
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
  } catch {
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
    res.json({ success: true, data: redactApprovalPayloads(await enrichApprovalRoleDescriptions(requests)) });
  }),

  approvalCounts: catchAsync(async (req, res) => {
    assertAdmin(req);
    const pending = await AdminApprovalModel.count({ status: 'Pending' });
    res.json({ success: true, data: { pending } });
  }),

  listUsers: catchAsync(async (req, res) => {
    assertAdmin(req);
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const usersRaw = data.users || [];
    const permissionsByUser = await UserPermissionModel.findForUsers(usersRaw.map((user) => user.id));
    const clientPermissionsByUser = await UserPermissionModel.findClientPermissionsForUsers(usersRaw.map((user) => user.id));
    const users = usersRaw.map((user) => ({
      ...normalizeUserWithPermissions(user, permissionsByUser),
      client_permissions: clientPermissionsByUser[user.id] || {},
    }))
      .sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
    res.json({ success: true, data: users });
  }),

  listClients: catchAsync(async (req, res) => {
    assertAdmin(req);
    const [contractualResult, permanentResult] = await Promise.all([
      adminSupabase
        .from('clients')
        .select('id, client_name, abbreviation, is_active')
        .eq('is_active', true)
        .order('client_name'),
      adminSupabase
        .from('permanent_clients')
        .select('id, client_name, abbreviation, is_active')
        .eq('is_active', true)
        .order('client_name'),
    ]);
    if (contractualResult.error) throw new Error(contractualResult.error.message);
    if (permanentResult.error) throw new Error(permanentResult.error.message);
    const contractual = dedupeAdminClients(contractualResult.data, 'contractual');
    const permanent = dedupeAdminClients(permanentResult.data, 'permanent');
    res.json({ success: true, data: contractual.concat(permanent) });
  }),

  myPermissions: catchAsync(async (req, res) => {
    if (isAdminUser(req.user)) {
      const permissions = {};
      UserPermissionModel.modules.forEach((moduleKey) => { permissions[moduleKey] = true; });
      return res.json({ success: true, data: { modules: UserPermissionModel.modules, permissions } });
    }
    const permissions = await UserPermissionModel.findForUser(req.user.id);
    const clientPermissions = await UserPermissionModel.findClientPermissionsForUser(req.user.id);
    return res.json({ success: true, data: { modules: UserPermissionModel.modules, permissions, client_permissions: clientPermissions } });
  }),

  createUser: catchAsync(async (req, res) => {
    assertAdmin(req);
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const sendCredentials = req.body.sendCredentials !== false;
    const password = String(req.body.password || '').trim() || generateTemporaryPassword();
    const permissions = normalizePermissions(req.body.permissions);

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
        name,
        password_changed_once: false,
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

    const savedPermissions = await UserPermissionModel.replaceForUser(data.user.id, permissions);
    const clientPermissions = Array.isArray(req.body.client_permissions)
      ? await UserPermissionModel.replaceForUserClients(
        data.user.id,
        req.body.client_permissions.map((entry) => ({
          client_type: entry.client_type || 'contractual',
          client_id: entry.client_id,
          permissions: normalizePermissions(entry.permissions),
        }))
      )
      : {};

    res.status(201).json({
      success: true,
      data: {
        user: { ...normalizeUser(data.user), permissions: savedPermissions, client_permissions: clientPermissions },
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

    const { data: existing, error: existingError } = await adminSupabase.auth.admin.getUserById(id);
    if (existingError) throw new Error(existingError.message);
    if (!existing || !existing.user) throw new AppError(404, 'User not found');
    if (isAdminUser(existing.user)) throw new AppError(400, 'Admin user cannot be deleted');

    const { error } = await adminSupabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { message: 'User deleted' } });
  }),

  updateUser: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    const email = req.body.email !== undefined ? String(req.body.email || '').trim().toLowerCase() : undefined;
    const name = req.body.name !== undefined ? String(req.body.name || '').trim() : undefined;
    const password = req.body.password !== undefined ? String(req.body.password || '').trim() : undefined;
    const update = {};

    if (name !== undefined) {
      if (!name) throw new AppError(400, 'Name is required');
      const { data: existing, error: existingError } = await adminSupabase.auth.admin.getUserById(id);
      if (existingError) throw new Error(existingError.message);
      if (!existing || !existing.user) throw new AppError(404, 'User not found');
      const meta = existing.user.user_metadata || {};
      update.user_metadata = { ...meta, full_name: name, name };
    }
    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Valid email is required');
      update.email = email;
      update.email_confirm = true;
    }
    if (password !== undefined && password) {
      if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
      update.password = password;
    }

    let updatedUser;
    if (Object.keys(update).length > 0) {
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, update);
      if (error) throw new Error(error.message);
      updatedUser = data.user;
    } else {
      const { data, error } = await adminSupabase.auth.admin.getUserById(id);
      if (error) throw new Error(error.message);
      updatedUser = data.user;
    }

    const permissions = req.body.permissions
      ? await UserPermissionModel.replaceForUser(id, normalizePermissions(req.body.permissions))
      : await UserPermissionModel.findForUser(id, { admin: true });

    res.json({ success: true, data: { user: { ...normalizeUser(updatedUser), permissions } } });
  }),

  updateUserPermissions: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    if (Array.isArray(req.body.client_permissions)) {
      const clientPermissions = await UserPermissionModel.replaceForUserClients(
        id,
        req.body.client_permissions.map((entry) => ({
          client_type: entry.client_type || 'contractual',
          client_id: entry.client_id,
          permissions: normalizePermissions(entry.permissions),
        }))
      );
      const permissions = await UserPermissionModel.findForUser(id, { admin: true });
      return res.json({ success: true, data: { userId: id, permissions, client_permissions: clientPermissions } });
    }
    if (req.body.client_id) {
      const clientPermissions = await UserPermissionModel.replaceForUserClient(
        id,
        req.body.client_type || 'contractual',
        req.body.client_id,
        normalizePermissions(req.body.permissions)
      );
      const permissions = await UserPermissionModel.findForUser(id, { admin: true });
      return res.json({ success: true, data: { userId: id, permissions, client_permissions: clientPermissions } });
    }
    const permissions = await UserPermissionModel.replaceForUser(id, normalizePermissions(req.body.permissions));
    return res.json({ success: true, data: { userId: id, permissions } });
  }),

  myApprovals: catchAsync(async (req, res) => {
    const requests = await AdminApprovalModel.findAll({
      mine: true,
      userId: req.user.id,
      status: req.query.status,
    });
    res.json({ success: true, data: redactApprovalPayloads(requests) });
  }),

  approve: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    const request = await AdminApprovalModel.findById(id);
    if (!request) throw new AppError(404, 'Approval request not found');
    if (request.status !== 'Pending') throw new AppError(400, 'Only pending requests can be approved');

    const result = await executeApprovedRequest(req, request);
    const updated = await AdminApprovalModel.updateStatus(id, 'Approved', req.user);
    res.json({ success: true, data: { request: redactApprovalPayload(updated), result } });
  }),

  reject: catchAsync(async (req, res) => {
    assertAdmin(req);
    const id = req.params.id;
    const request = await AdminApprovalModel.findById(id);
    if (!request) throw new AppError(404, 'Approval request not found');
    if (request.status !== 'Pending') throw new AppError(400, 'Only pending requests can be rejected');

    const updated = await AdminApprovalModel.updateStatus(id, 'Rejected', req.user);
    res.json({ success: true, data: { request: redactApprovalPayload(updated) } });
  }),
};

module.exports = adminController;
