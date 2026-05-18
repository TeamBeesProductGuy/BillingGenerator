const { adminSupabase } = require('../config/database');
const AdminApprovalModel = require('../models/adminApproval.model');
const catchAsync = require('../middleware/catchAsync');
const { AppError } = require('../middleware/errorHandler');
const {
  buildProfileChangeRequest,
  isAdminUser,
} = require('../services/adminApproval.service');
const { logActivity } = require('../services/activityLog.service');

function normalizeUser(user) {
  const meta = user && user.user_metadata ? user.user_metadata : {};
  return {
    id: user.id,
    email: user.email || '',
    name: meta.full_name || meta.name || meta.display_name || '',
    is_admin: Boolean(user.is_admin),
    password_changed_once: Boolean(meta.password_changed_once),
    password_change_requires_approval: Boolean(meta.password_changed_once),
  };
}

function assertPassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
  return value;
}

async function getFreshUser(userId) {
  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  if (!data || !data.user) throw new AppError(404, 'User not found');
  return data.user;
}

async function createProfileApproval(req, res, payload) {
  const requestEntry = buildProfileChangeRequest(req, payload);
  const base = {
    ...requestEntry,
    requester_user_id: req.user.id,
    requester_email: req.user.email || null,
    requester_name: (req.user.user_metadata && (req.user.user_metadata.full_name || req.user.user_metadata.name)) || req.user.email || null,
    status: 'Pending',
  };
  const existing = await AdminApprovalModel.findPendingDuplicate(base);
  const request = existing || await AdminApprovalModel.create(base);
  const responseRequest = request.action_key === 'profile.password'
    ? { ...request, request_payload: { ...request.request_payload, password: '[redacted]' } }
    : request;
  return res.status(202).json({
    success: true,
    approvalRequired: true,
    data: {
      request: responseRequest,
      message: 'Your request has been sent to the admin for approval. This action will only be performed after confirmation.',
      status: 'Admin Approval Awaited',
    },
  });
}

const profileController = {
  me: catchAsync(async (req, res) => {
    const user = await getFreshUser(req.user.id);
    res.json({ success: true, data: normalizeUser({ ...user, is_admin: isAdminUser(req.user) }) });
  }),

  requestUpdate: catchAsync(async (req, res) => {
    const changes = {};
    if (req.body.name !== undefined) {
      changes.name = String(req.body.name || '').trim();
      if (!changes.name) throw new AppError(400, 'Name is required');
    }
    if (req.body.email !== undefined) {
      changes.email = String(req.body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) throw new AppError(400, 'Valid email is required');
    }
    if (Object.keys(changes).length === 0) throw new AppError(400, 'No profile changes submitted');

    if (isAdminUser(req.user)) {
      const existing = await getFreshUser(req.user.id);
      const meta = existing.user_metadata || {};
      const update = {};
      if (changes.name !== undefined) update.user_metadata = { ...meta, full_name: changes.name, name: changes.name };
      if (changes.email !== undefined) {
        update.email = changes.email;
        update.email_confirm = true;
      }
      const { data, error } = await adminSupabase.auth.admin.updateUserById(req.user.id, update);
      if (error) throw new Error(error.message);
      await logActivity(req, {
        module: 'profile',
        action: 'update',
        entityType: 'user_profile',
        entityId: req.user.id,
        entityLabel: data.user ? data.user.email : req.user.email,
        details: { summary: 'Admin updated own profile' },
      });
      return res.json({ success: true, data: normalizeUser({ ...data.user, is_admin: true }) });
    }

    return createProfileApproval(req, res, changes);
  }),

  changePassword: catchAsync(async (req, res) => {
    const password = assertPassword(req.body.password);
    const user = await getFreshUser(req.user.id);
    const meta = user.user_metadata || {};
    const firstChange = !meta.password_changed_once;

    if (firstChange || isAdminUser(req.user)) {
      const nextMeta = { ...meta, password_changed_once: true };
      const { data, error } = await adminSupabase.auth.admin.updateUserById(req.user.id, {
        password,
        user_metadata: nextMeta,
      });
      if (error) throw new Error(error.message);
      await logActivity(req, {
        module: 'profile',
        action: 'password_change',
        entityType: 'user_profile',
        entityId: req.user.id,
        entityLabel: user.email,
        details: { summary: firstChange ? 'User changed password for the first time' : 'Admin changed own password' },
      });
      return res.json({ success: true, data: normalizeUser({ ...data.user, is_admin: isAdminUser(req.user) }), message: 'Password updated' });
    }

    return createProfileApproval(req, res, { password });
  }),
};

module.exports = profileController;
