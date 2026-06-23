const crypto = require('crypto');
const env = require('../config/env');
const { AppError } = require('./errorHandler');

// Guards service-to-service integration endpoints (e.g. the HR Ops "Export to
// Billing Gen" push). Authenticates with a shared secret in the `x-api-key`
// header instead of a user session. Fails closed when no key is configured.
function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireIntegrationKey(req, res, next) {
  const configured = env.integrationApiKey;
  if (!configured) {
    return next(new AppError(503, 'Integration is not configured on this server'));
  }
  const provided = req.get('x-api-key') || '';
  if (!timingSafeEqual(provided, configured)) {
    return next(new AppError(401, 'Invalid integration key'));
  }
  return next();
}

module.exports = { requireIntegrationKey };
