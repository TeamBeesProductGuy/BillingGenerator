const { AsyncLocalStorage } = require('async_hooks');
const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

if (!env.supabaseUrl || !env.supabaseServiceRoleKey || !env.supabaseAnonKey) {
  console.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const requestDbStorage = new AsyncLocalStorage();

const adminSupabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createRequestSupabaseClient(accessToken) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getActiveClient() {
  return requestDbStorage.getStore() || adminSupabase;
}

function runWithRequestClient(client, callback) {
  return requestDbStorage.run(client, callback);
}

const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getActiveClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

module.exports = {
  supabase,
  adminSupabase,
  createRequestSupabaseClient,
  runWithRequestClient,

  async init() {
    const { error } = await adminSupabase.from('clients').select('id', { count: 'exact', head: true });
    if (error) {
      console.error('Supabase connection check failed:', error.message);
      console.error('Make sure you have run database/supabase_schema.sql in the Supabase SQL Editor');
      process.exit(1);
    }
  },

  close() {
    // No-op: Supabase JS client manages connections automatically
  },
};
