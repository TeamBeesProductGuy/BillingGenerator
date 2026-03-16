const { supabase } = require('../config/database');

const POTracker = {
  async checkAlerts() {
    const { data: valueAlerts, error: vaErr } = await supabase
      .from('purchase_orders_view')
      .select('*, clients:client_id(client_name)')
      .eq('status', 'Active')
      .gt('po_value', 0)
      .gte('consumption_pct', 80);

    if (vaErr) throw new Error(vaErr.message);

    const { data: expiryAlerts, error: eaErr } = await supabase
      .from('purchase_orders_view')
      .select('*')
      .eq('status', 'Active')
      .lte('end_date', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

    if (eaErr) throw new Error(eaErr.message);

    return { valueAlerts: valueAlerts || [], expiryAlerts: expiryAlerts || [] };
  },

  async checkAndUpdateExpired() {
    const { error } = await supabase.rpc('check_and_update_expired_pos');
    if (error) throw new Error(error.message);
  },
};

module.exports = POTracker;
