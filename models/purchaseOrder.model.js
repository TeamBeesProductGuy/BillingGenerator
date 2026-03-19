const { supabase } = require('../config/database');

const POModel = {
  async findAll(clientId, status) {
    let query = supabase.from('purchase_orders_view').select('*');
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id) {
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (poErr) throw new Error(poErr.message);
    if (!po) return null;

    const [logResult, empResult] = await Promise.all([
      supabase
        .from('po_consumption_log')
        .select('*')
        .eq('po_id', id)
        .order('consumed_at', { ascending: false }),
      supabase
        .from('rate_cards')
        .select('emp_code, emp_name, reporting_manager, monthly_rate')
        .eq('po_id', id)
        .eq('is_active', true)
        .order('emp_code'),
    ]);
    if (logResult.error) throw new Error(logResult.error.message);
    if (empResult.error) throw new Error(empResult.error.message);

    return { ...po, consumptionLog: logResult.data, linkedEmployees: empResult.data };
  },

  async create(data) {
    const { data: row, error } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: data.po_number,
        client_id: data.client_id,
        quote_id: data.quote_id || null,
        po_date: data.po_date,
        start_date: data.start_date,
        end_date: data.end_date,
        po_value: data.po_value,
        alert_threshold: data.alert_threshold || 80,
        sow_id: data.sow_id || null,
        notes: data.notes || null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return row.id;
  },

  async update(id, data) {
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        po_number: data.po_number,
        client_id: data.client_id,
        po_date: data.po_date,
        start_date: data.start_date,
        end_date: data.end_date,
        po_value: data.po_value,
        alert_threshold: data.alert_threshold || 80,
        sow_id: data.sow_id || null,
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async addConsumption(poId, amount, description, billingRunId) {
    const { error } = await supabase.rpc('consume_po', {
      p_po_id: poId,
      p_amount: amount,
      p_description: description || null,
      p_billing_run_id: billingRunId || null,
    });
    if (error) throw new Error(error.message);
  },

  async getAlerts() {
    const { data, error } = await supabase.rpc('get_po_alerts');
    if (error) throw new Error(error.message);
    return data;
  },

  async renew(id, newPoData) {
    const { data, error } = await supabase.rpc('renew_po', {
      p_old_id: id,
      p_po_number: newPoData.po_number,
      p_client_id: newPoData.client_id,
      p_po_date: newPoData.po_date,
      p_start_date: newPoData.start_date,
      p_end_date: newPoData.end_date,
      p_po_value: newPoData.po_value,
      p_alert_threshold: newPoData.alert_threshold || 80,
      p_notes: newPoData.notes || null,
      p_sow_id: newPoData.sow_id || null,
    });
    if (error) throw new Error(error.message);
    return data;
  },
};

module.exports = POModel;
