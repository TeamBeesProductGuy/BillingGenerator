const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = {
  supabase,

  async init() {
    // Verify connection by querying a lightweight table
    const { error } = await supabase.from('clients').select('id', { count: 'exact', head: true });
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
