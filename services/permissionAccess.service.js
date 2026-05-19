const { adminSupabase } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { isAdminUser } = require('./adminApproval.service');

function normalizeIdentity(row) {
  return String(row && (row.abbreviation || row.client_name) || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function fetchContractualClients() {
  const { data, error } = await adminSupabase
    .from('clients')
    .select('id, client_name, abbreviation, is_active')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return data || [];
}

function expandDuplicateClientIds(clients, ids) {
  const identityById = new Map();
  clients.forEach((client) => {
    identityById.set(Number(client.id), normalizeIdentity(client));
  });

  const allowedIdentities = new Set();
  ids.forEach((id) => {
    const identity = identityById.get(Number(id));
    if (identity) allowedIdentities.add(identity);
  });

  return clients
    .filter((client) => allowedIdentities.has(normalizeIdentity(client)))
    .map((client) => Number(client.id));
}

async function allowedContractualClientIds(user, moduleKey) {
  if (isAdminUser(user)) {
    const clients = await fetchContractualClients();
    return clients.map((client) => Number(client.id));
  }

  const { data, error } = await adminSupabase
    .from('user_client_module_permissions')
    .select('client_id')
    .eq('user_id', user.id)
    .eq('client_type', 'contractual')
    .eq('module_key', moduleKey)
    .eq('can_access', true);
  if (error) throw new Error(error.message);

  const baseIds = Array.from(new Set((data || []).map((row) => Number(row.client_id)).filter(Boolean)));
  if (baseIds.length === 0) return [];

  const clients = await fetchContractualClients();
  return Array.from(new Set(expandDuplicateClientIds(clients, baseIds)));
}

async function allowedContractualClientIdsForAny(user, moduleKeys) {
  const keys = Array.from(new Set((moduleKeys || []).filter(Boolean)));
  if (keys.length === 0) return [];
  if (isAdminUser(user)) return allowedContractualClientIds(user, keys[0]);

  const clientIdSets = await Promise.all(keys.map((moduleKey) => allowedContractualClientIds(user, moduleKey)));
  return Array.from(new Set(clientIdSets.flat().map((id) => Number(id)).filter(Boolean)));
}

async function allowedPermanentClientIds(user, moduleKey) {
  if (isAdminUser(user)) {
    const { data, error } = await adminSupabase
      .from('permanent_clients')
      .select('id')
      .eq('is_active', true);
    if (error) throw new Error(error.message);
    return (data || []).map((row) => Number(row.id)).filter(Boolean);
  }

  const { data, error } = await adminSupabase
    .from('user_client_module_permissions')
    .select('client_id')
    .eq('user_id', user.id)
    .eq('client_type', 'permanent')
    .eq('module_key', moduleKey)
    .eq('can_access', true);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data || []).map((row) => Number(row.client_id)).filter(Boolean)));
}

async function allowedPermanentClientIdsForAny(user, moduleKeys) {
  const keys = Array.from(new Set((moduleKeys || []).filter(Boolean)));
  if (keys.length === 0) return [];
  if (isAdminUser(user)) return allowedPermanentClientIds(user, keys[0]);
  const clientIdSets = await Promise.all(keys.map((moduleKey) => allowedPermanentClientIds(user, moduleKey)));
  return Array.from(new Set(clientIdSets.flat()));
}

async function filterAllowedContractualClientId(user, moduleKey, requestedClientId) {
  const allowedIds = await allowedContractualClientIds(user, moduleKey);
  if (!requestedClientId) return allowedIds;
  const id = Number(requestedClientId);
  return allowedIds.includes(id) ? [id] : [];
}

async function filterAllowedContractualClientIdForAny(user, moduleKeys, requestedClientId) {
  const allowedIds = await allowedContractualClientIdsForAny(user, moduleKeys);
  if (!requestedClientId) return allowedIds;
  const id = Number(requestedClientId);
  return allowedIds.includes(id) ? [id] : [];
}

async function requireContractualClientAccess(req, moduleKey, clientId) {
  const allowedIds = await filterAllowedContractualClientId(req.user, moduleKey, clientId);
  if (allowedIds.length === 0) {
    throw new AppError(403, 'You do not have permission for this client');
  }
}

async function requireContractualClientReadAccess(req, moduleKeys, clientId) {
  const allowedIds = await filterAllowedContractualClientIdForAny(req.user, moduleKeys, clientId);
  if (allowedIds.length === 0) {
    throw new AppError(403, 'You do not have read permission for this client');
  }
}

async function filterAllowedPermanentClientId(user, moduleKey, requestedClientId) {
  const allowedIds = await allowedPermanentClientIds(user, moduleKey);
  if (!requestedClientId) return allowedIds;
  const id = Number(requestedClientId);
  return allowedIds.includes(id) ? [id] : [];
}

async function filterAllowedPermanentClientIdForAny(user, moduleKeys, requestedClientId) {
  const allowedIds = await allowedPermanentClientIdsForAny(user, moduleKeys);
  if (!requestedClientId) return allowedIds;
  const id = Number(requestedClientId);
  return allowedIds.includes(id) ? [id] : [];
}

async function requirePermanentClientAccess(req, moduleKey, clientId) {
  const allowedIds = await filterAllowedPermanentClientId(req.user, moduleKey, clientId);
  if (allowedIds.length === 0) {
    throw new AppError(403, 'You do not have permission for this permanent client');
  }
}

async function requirePermanentClientReadAccess(req, moduleKeys, clientId) {
  const allowedIds = await filterAllowedPermanentClientIdForAny(req.user, moduleKeys, clientId);
  if (allowedIds.length === 0) {
    throw new AppError(403, 'You do not have read permission for this permanent client');
  }
}

module.exports = {
  allowedContractualClientIds,
  allowedContractualClientIdsForAny,
  allowedPermanentClientIds,
  allowedPermanentClientIdsForAny,
  filterAllowedContractualClientId,
  filterAllowedContractualClientIdForAny,
  filterAllowedPermanentClientId,
  filterAllowedPermanentClientIdForAny,
  requireContractualClientAccess,
  requireContractualClientReadAccess,
  requirePermanentClientAccess,
  requirePermanentClientReadAccess,
};
