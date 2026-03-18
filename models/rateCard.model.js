const { supabase } = require('../config/database');

const RateCardModel = {
  async findAll(clientId) {
    let query = supabase
      .from('rate_cards_view')
      .select('*')
      .eq('is_active', true);
    if (clientId) query = query.eq('client_id', clientId);
    query = query.order('client_name').order('emp_code');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('rate_cards_view')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async findByEmpCode(empCode, clientId) {
    const { data, error } = await supabase
      .from('rate_cards')
      .select('*')
      .eq('emp_code', empCode)
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(data) {
    const { data: row, error } = await supabase
      .from('rate_cards')
      .insert({
        client_id: data.client_id,
        emp_code: data.emp_code,
        emp_name: data.emp_name,
        doj: data.doj || null,
        reporting_manager: data.reporting_manager || null,
        monthly_rate: data.monthly_rate,
        leaves_allowed: data.leaves_allowed || 0,
        date_of_reporting: data.date_of_reporting || null,
        po_id: data.po_id || null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return row.id;
  },

  async bulkCreate(records) {
    const rows = records.map((data) => ({
      client_id: data.client_id,
      emp_code: data.emp_code,
      emp_name: data.emp_name,
      doj: data.doj || null,
      reporting_manager: data.reporting_manager || null,
      monthly_rate: data.monthly_rate,
      leaves_allowed: data.leaves_allowed || 0,
      date_of_reporting: data.date_of_reporting || null,
      po_id: data.po_id || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase
      .from('rate_cards')
      .upsert(rows, { onConflict: 'client_id,emp_code' })
      .select('id');
    if (error) throw new Error(error.message);
    return data.map((r) => r.id);
  },

  async update(id, data) {
    const { error } = await supabase
      .from('rate_cards')
      .update({
        emp_name: data.emp_name,
        doj: data.doj || null,
        reporting_manager: data.reporting_manager || null,
        monthly_rate: data.monthly_rate,
        leaves_allowed: data.leaves_allowed || 0,
        date_of_reporting: data.date_of_reporting || null,
        po_id: data.po_id !== undefined ? (data.po_id || null) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async findByPoId(poId) {
    const { data, error } = await supabase
      .from('rate_cards_view')
      .select('*')
      .eq('po_id', poId)
      .eq('is_active', true)
      .order('emp_code');
    if (error) throw new Error(error.message);
    return data;
  },

  async softDelete(id) {
    const { error } = await supabase
      .from('rate_cards')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = RateCardModel;
