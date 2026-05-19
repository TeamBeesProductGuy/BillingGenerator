const UserPermissionModel = require('../models/userPermission.model');
const { AppError } = require('./errorHandler');
const { isAdminUser } = require('../services/adminApproval.service');

const API_MODULES = [
  { prefix: '/billing', module: 'billing' },
  { prefix: '/clients/permanent', module: 'clients' },
  { prefix: '/permanent/clients', module: 'clients' },
  { prefix: '/orders/permanent', module: 'orders' },
  { prefix: '/permanent/orders', module: 'orders' },
  { prefix: '/reminders/permanent', module: 'reminders' },
  { prefix: '/permanent/reminders', module: 'reminders' },
  { prefix: '/clients', module: 'clients' },
  { prefix: '/rate-cards', module: 'rate_cards' },
  { prefix: '/attendance', module: 'attendance' },
  { prefix: '/quotes', module: 'quotes' },
  { prefix: '/sows', module: 'sows' },
  { prefix: '/purchase-orders', module: 'purchase_orders' },
];

const READ_DEPENDENCIES = [
  {
    pattern: /^\/clients(?:\/(?!permanent(?:\/|$))[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['sows', 'quotes', 'purchase_orders', 'rate_cards', 'attendance', 'billing'],
  },
  {
    pattern: /^\/clients\/permanent(?:\/[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['orders', 'reminders'],
  },
  {
    pattern: /^\/permanent\/clients(?:\/[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['orders', 'reminders'],
  },
  {
    pattern: /^\/orders\/permanent(?:\/[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['reminders'],
  },
  {
    pattern: /^\/permanent\/orders(?:\/[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['reminders'],
  },
  {
    pattern: /^\/sows(?:\/(?!documents(?:\/|$))[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['quotes', 'purchase_orders', 'rate_cards', 'billing'],
  },
  {
    pattern: /^\/quotes$/,
    methods: ['GET'],
    allowedBy: ['sows'],
  },
  {
    pattern: /^\/purchase-orders(?:\/[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['rate_cards', 'billing'],
  },
  {
    pattern: /^\/rate-cards(?:\/[^/]+)?$/,
    methods: ['GET'],
    allowedBy: ['attendance', 'billing'],
  },
];

const ACTION_DEPENDENCIES = [
  {
    pattern: /^\/rate-cards\/[^/]+\/leaves-allowed$/,
    methods: ['PATCH'],
    allowedBy: ['attendance'],
  },
  {
    pattern: /^\/permanent\/reminders\/[^/]+\/payment-status$/,
    methods: ['PATCH'],
    allowedBy: ['orders'],
  },
  {
    pattern: /^\/permanent\/reminders\/[^/]+\/invoice-sent$/,
    methods: ['PATCH'],
    allowedBy: ['orders'],
  },
];

function pathMatchesPrefix(path, prefix) {
  return path === prefix || path.startsWith(prefix + '/');
}

function resolveModule(path) {
  const requestPath = String(path || '');
  const match = API_MODULES.find((item) => pathMatchesPrefix(requestPath, item.prefix));
  return match ? match.module : null;
}

function hasAnyPermission(permissions, moduleKeys) {
  return (moduleKeys || []).some((moduleKey) => permissions[moduleKey] === true);
}

function isDependencyAllowed(req, permissions) {
  const requestPath = String(req.path || '');
  const method = String(req.method || 'GET').toUpperCase();

  const readRule = READ_DEPENDENCIES.find((rule) => (
    rule.methods.includes(method)
    && rule.pattern.test(requestPath)
    && hasAnyPermission(permissions, rule.allowedBy)
  ));
  if (readRule) return true;

  return ACTION_DEPENDENCIES.some((rule) => (
    rule.methods.includes(method)
    && rule.pattern.test(requestPath)
    && hasAnyPermission(permissions, rule.allowedBy)
  ));
}

async function requireModuleAccess(req, _res, next) {
  try {
    const moduleKey = resolveModule(req.path);
    if (!moduleKey || isAdminUser(req.user)) return next();

    const permissions = await UserPermissionModel.findForUser(req.user.id);
    if (permissions[moduleKey] === true) return next();
    if (isDependencyAllowed(req, permissions)) return next();

    return next(new AppError(403, 'You do not have permission to access this module'));
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireModuleAccess };
