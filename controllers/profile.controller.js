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

  requestUpdate: catchAsync(async (_req, _res) => {
    throw new AppError(403, 'User name and email changes are managed by admin only');
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
