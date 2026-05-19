const { supabase, adminSupabase } = require('../config/database');

const TABLE = 'admin_approval_requests';

function normalizeStatus(status) {
  const value = String(status || 'Pending').trim();
  return ['Pending', 'Approved', 'Rejected'].includes(value) ? value : 'Pending';
}

const AdminApprovalModel = {
  async create(entry) {
    const payload = {
      requester_user_id: entry.requester_user_id,
      requester_email: entry.requester_email || null,
      requester_name: entry.requester_name || entry.requester_email || null,
      role_description: entry.role_description || null,
      module: entry.module,
      action_key: entry.action_key,
      action_label: entry.action_label,
      entity_type: entry.entity_type,
      entity_id: String(entry.entity_id),
      entity_label: entry.entity_label || null,
      client_id: entry.client_id || null,
      client_name: entry.client_name || null,
      permission_message: entry.permission_message,
      request_payload: entry.request_payload || {},
      status: normalizeStatus(entry.status),
    };

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async findPendingDuplicate(entry) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('requester_user_id', entry.requester_user_id)
      .eq('module', entry.module)
      .eq('action_key', entry.action_key)
      .eq('entity_type', entry.entity_type)
      .eq('entity_id', String(entry.entity_id))
      .eq('status', 'Pending')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },

  async findAll(filters) {
    const safeFilters = filters || {};
    let query = supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (safeFilters.status) query = query.eq('status', normalizeStatus(safeFilters.status));
    if (safeFilters.module) query = query.eq('module', safeFilters.module);
    if (safeFilters.mine && safeFilters.userId) query = query.eq('requester_user_id', safeFilters.userId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async count(filters) {
    const safeFilters = filters || {};
    let query = adminSupabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true });

    if (safeFilters.status) query = query.eq('status', normalizeStatus(safeFilters.status));
    if (safeFilters.module) query = query.eq('module', safeFilters.module);
    if (safeFilters.mine && safeFilters.userId) query = query.eq('requester_user_id', safeFilters.userId);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count || 0;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },

  async updateStatus(id, status, reviewer) {
    const payload = {
      status: normalizeStatus(status),
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: reviewer && reviewer.id ? reviewer.id : null,
      reviewed_by_email: reviewer && reviewer.email ? reviewer.email : null,
    };
    const { data, error } = await adminSupabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};

module.exports = AdminApprovalModel;
