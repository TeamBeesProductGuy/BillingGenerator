const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const { AppError } = require('./errorHandler');

// Use anon key client to verify user tokens
const supabaseAuth = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required'));
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    return next(new AppError(401, 'Invalid or expired token'));
  }

  req.user = user;
  next();
}

module.exports = { requireAuth };
