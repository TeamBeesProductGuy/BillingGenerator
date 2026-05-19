const { adminSupabase } = require('../config/database');

const TABLE = 'activity_logs';

function normalizeLimit(value) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return 100;
  return Math.min(num, 500);
}

const ActivityLogModel = {
  async create(entry) {
    const payload = {
      owner_user_id: entry.owner_user_id,
      user_email: entry.user_email || null,
      module: entry.module,
      action: entry.action,
      entity_type: entry.entity_type || null,
      entity_id: entry.entity_id != null ? String(entry.entity_id) : null,
      entity_label: entry.entity_label || null,
      details: entry.details || null,
    };

    const { error } = await adminSupabase.from(TABLE).insert(payload);
    if (error) throw new Error(error.message);
  },

  async findAll(filters) {
    const safeFilters = filters || {};
    let query = adminSupabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(normalizeLimit(safeFilters.limit));

    if (safeFilters.ownerUserId && !safeFilters.includeAllUsers) {
      query = query.eq('owner_user_id', safeFilters.ownerUserId);
    }
    if (safeFilters.module) query = query.eq('module', safeFilters.module);
    if (safeFilters.action) query = query.eq('action', safeFilters.action);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let rows = data || [];
    const q = String(safeFilters.q || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => {
        const haystack = [
          row.user_email,
          row.module,
          row.action,
          row.entity_type,
          row.entity_id,
          row.entity_label,
          row.details ? JSON.stringify(row.details) : '',
        ].join(' ').toLowerCase();
        return haystack.indexOf(q) !== -1;
      });
    }

    return rows;
  },
};

module.exports = ActivityLogModel;
