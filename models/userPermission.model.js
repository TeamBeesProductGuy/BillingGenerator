const { adminSupabase, supabase } = require('../config/database');

const TABLE = 'user_module_permissions';
const CLIENT_TABLE = 'user_client_module_permissions';

const MODULES = [
  'clients',
  'sows',
  'quotes',
  'purchase_orders',
  'rate_cards',
  'attendance',
  'billing',
  'orders',
  'reminders',
];

function normalizeModuleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function isMissingRelationError(error) {
  const message = String(error && error.message ? error.message : '').toLowerCase();
  return Boolean(error && (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('could not find the table')
    || message.includes('does not exist')
    || message.includes('schema cache')
  ));
}

function migrationRequiredError() {
  return new Error('Client-level permissions are not installed yet. Run database/migrations/030_user_module_permissions.sql in Supabase first.');
}

function normalizePermissions(rows) {
  const map = {};
  MODULES.forEach((moduleKey) => {
    map[moduleKey] = false;
  });
  if (rows && !Array.isArray(rows) && typeof rows === 'object') {
    MODULES.forEach((moduleKey) => {
      map[moduleKey] = rows[moduleKey] === true;
    });
    return map;
  }
  (rows || []).forEach((row) => {
    const key = normalizeModuleKey(row.module_key);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      map[key] = row.can_access === true;
    }
  });
  return map;
}

function clientPermissionKey(row) {
  const type = String(row.client_type || 'contractual').trim().toLowerCase();
  return `${type}:${row.client_id}`;
}

function normalizeClientPermissions(rows) {
  const result = {};
  (rows || []).forEach((row) => {
    const key = clientPermissionKey(row);
    if (!result[key]) {
      result[key] = {
        client_type: String(row.client_type || 'contractual').trim().toLowerCase(),
        client_id: row.client_id,
        permissions: normalizePermissions({}),
      };
    }
    const moduleKey = normalizeModuleKey(row.module_key);
    if (Object.prototype.hasOwnProperty.call(result[key].permissions, moduleKey)) {
      result[key].permissions[moduleKey] = row.can_access === true;
    }
  });
  return result;
}

function aggregateClientPermissions(clientPermissions, fallbackPermissions) {
  const aggregate = normalizePermissions({});
  Object.values(clientPermissions || {}).forEach((entry) => {
    MODULES.forEach((moduleKey) => {
      if (entry.permissions && entry.permissions[moduleKey] === true) {
        aggregate[moduleKey] = true;
      }
    });
  });
  MODULES.forEach((moduleKey) => {
    if (!aggregate[moduleKey] && fallbackPermissions && fallbackPermissions[moduleKey] === true) {
      aggregate[moduleKey] = true;
    }
  });
  return aggregate;
}

const UserPermissionModel = {
  modules: MODULES.slice(),

  normalizeModuleKey,

  async findForUser(userId, options = {}) {
    const client = options.admin ? adminSupabase : supabase;
    const { data, error } = await client
      .from(TABLE)
      .select('module_key, can_access')
      .eq('user_id', userId);
    if (error && isMissingRelationError(error)) return normalizePermissions({});
    if (error) throw new Error(error.message);
    const fallbackPermissions = normalizePermissions(data || []);

    const { data: clientRows, error: clientError } = await client
      .from(CLIENT_TABLE)
      .select('client_type, client_id, module_key, can_access')
      .eq('user_id', userId);
    if (clientError && !isMissingRelationError(clientError)) throw new Error(clientError.message);

    return aggregateClientPermissions(normalizeClientPermissions(clientRows || []), fallbackPermissions);
  },

  async findClientPermissionsForUser(userId, options = {}) {
    const client = options.admin ? adminSupabase : supabase;
    const { data, error } = await client
      .from(CLIENT_TABLE)
      .select('client_type, client_id, module_key, can_access')
      .eq('user_id', userId);
    if (error && isMissingRelationError(error)) return {};
    if (error) throw new Error(error.message);
    return normalizeClientPermissions(data || []);
  },

  async findForUsers(userIds) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (ids.length === 0) return {};

    const { data, error } = await adminSupabase
      .from(TABLE)
      .select('user_id, module_key, can_access')
      .in('user_id', ids);
    if (error && isMissingRelationError(error)) {
      const empty = {};
      ids.forEach((id) => { empty[id] = normalizePermissions({}); });
      return empty;
    }
    if (error) throw new Error(error.message);

    const { data: clientRows, error: clientError } = await adminSupabase
      .from(CLIENT_TABLE)
      .select('user_id, client_type, client_id, module_key, can_access')
      .in('user_id', ids);
    if (clientError && !isMissingRelationError(clientError)) throw new Error(clientError.message);

    const grouped = {};
    ids.forEach((id) => { grouped[id] = []; });
    (data || []).forEach((row) => {
      if (!grouped[row.user_id]) grouped[row.user_id] = [];
      grouped[row.user_id].push(row);
    });

    const clientGrouped = {};
    ids.forEach((id) => { clientGrouped[id] = []; });
    (clientRows || []).forEach((row) => {
      if (!clientGrouped[row.user_id]) clientGrouped[row.user_id] = [];
      clientGrouped[row.user_id].push(row);
    });

    const result = {};
    ids.forEach((id) => {
      const clientPermissions = normalizeClientPermissions(clientGrouped[id] || []);
      result[id] = aggregateClientPermissions(clientPermissions, normalizePermissions(grouped[id] || []));
    });
    return result;
  },

  async findClientPermissionsForUsers(userIds) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (ids.length === 0) return {};

    const { data, error } = await adminSupabase
      .from(CLIENT_TABLE)
      .select('user_id, client_type, client_id, module_key, can_access')
      .in('user_id', ids);
    if (error && isMissingRelationError(error)) {
      const empty = {};
      ids.forEach((id) => { empty[id] = {}; });
      return empty;
    }
    if (error) throw new Error(error.message);

    const grouped = {};
    ids.forEach((id) => { grouped[id] = []; });
    (data || []).forEach((row) => {
      if (!grouped[row.user_id]) grouped[row.user_id] = [];
      grouped[row.user_id].push(row);
    });

    const result = {};
    ids.forEach((id) => {
      result[id] = normalizeClientPermissions(grouped[id] || []);
    });
    return result;
  },

  async replaceForUser(userId, permissions) {
    const safePermissions = permissions || {};
    const rows = MODULES.map((moduleKey) => ({
      user_id: userId,
      module_key: moduleKey,
      can_access: safePermissions[moduleKey] === true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await adminSupabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'user_id,module_key' });
    if (error && isMissingRelationError(error)) throw migrationRequiredError();
    if (error) throw new Error(error.message);

    return this.findForUser(userId, { admin: true });
  },

  async replaceForUserClient(userId, clientType, clientId, permissions) {
    const safeClientType = String(clientType || 'contractual').trim().toLowerCase();
    const safeClientId = Number(clientId);
    if (!safeClientId) throw new Error('client_id is required');
    const safePermissions = permissions || {};
    const rows = MODULES.map((moduleKey) => ({
      user_id: userId,
      client_type: safeClientType,
      client_id: safeClientId,
      module_key: moduleKey,
      can_access: safePermissions[moduleKey] === true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await adminSupabase
      .from(CLIENT_TABLE)
      .upsert(rows, { onConflict: 'user_id,client_type,client_id,module_key' });
    if (error && isMissingRelationError(error)) throw migrationRequiredError();
    if (error) throw new Error(error.message);

    return this.findClientPermissionsForUser(userId, { admin: true });
  },

  async replaceForUserClients(userId, clientPermissions) {
    const entries = Array.isArray(clientPermissions) ? clientPermissions : [];
    const rows = [];

    entries.forEach((entry) => {
      const safeClientType = String(entry.client_type || 'contractual').trim().toLowerCase();
      const safeClientId = Number(entry.client_id);
      if (!safeClientId) return;
      const safePermissions = entry.permissions || {};
      MODULES.forEach((moduleKey) => {
        rows.push({
          user_id: userId,
          client_type: safeClientType,
          client_id: safeClientId,
          module_key: moduleKey,
          can_access: safePermissions[moduleKey] === true,
          updated_at: new Date().toISOString(),
        });
      });
    });

    if (rows.length === 0) return this.findClientPermissionsForUser(userId, { admin: true });

    const { error } = await adminSupabase
      .from(CLIENT_TABLE)
      .upsert(rows, { onConflict: 'user_id,client_type,client_id,module_key' });
    if (error && isMissingRelationError(error)) throw migrationRequiredError();
    if (error) throw new Error(error.message);

    return this.findClientPermissionsForUser(userId, { admin: true });
  },
};

module.exports = UserPermissionModel;
