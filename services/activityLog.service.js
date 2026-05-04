const ActivityLogModel = require('../models/activityLog.model');

async function logActivity(req, entry) {
  if (!req || !req.user || !entry || !entry.module || !entry.action) return;

  try {
    await ActivityLogModel.create({
      user_email: req.user.email || null,
      module: entry.module,
      action: entry.action,
      entity_type: entry.entityType || null,
      entity_id: entry.entityId != null ? entry.entityId : null,
      entity_label: entry.entityLabel || null,
      details: entry.details || null,
    });
  } catch (err) {
    console.warn('Activity log write failed:', err.message);
  }
}

module.exports = { logActivity };
