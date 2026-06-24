/* global fetch */
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');

// Thin client for the HR Ops (HR1) billing-export API. Authenticated with the
// shared integration key in the x-api-key header.
async function hrOpsFetch(path) {
  if (!env.hrOpsBaseUrl) {
    throw new AppError(503, 'HR Ops link is not configured. Set HR_OPS_BASE_URL.');
  }
  if (!env.integrationApiKey) {
    throw new AppError(503, 'Integration key is not configured. Set INTEGRATION_API_KEY.');
  }

  let res;
  try {
    res = await fetch(`${env.hrOpsBaseUrl.replace(/\/+$/, '')}${path}`, {
      headers: { 'x-api-key': env.integrationApiKey },
    });
  } catch (err) {
    throw new AppError(502, `Could not reach HR Ops: ${err.message}`);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AppError(502, (json && json.error) || `HR Ops returned HTTP ${res.status}`);
  }
  return json || {};
}

async function listHrClients() {
  const json = await hrOpsFetch('/api/billing-export/clients');
  return Array.isArray(json.clients) ? json.clients : [];
}

async function listHrEmployees(hrClientName) {
  const json = await hrOpsFetch(`/api/billing-export/employees?client=${encodeURIComponent(hrClientName)}`);
  return Array.isArray(json.employees) ? json.employees : [];
}

module.exports = { listHrClients, listHrEmployees };
