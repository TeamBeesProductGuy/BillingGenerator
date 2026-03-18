const { supabase } = require('../config/database');

const SOWModel = {
  async findAll(clientId, status) {
    let query = supabase.from('sows_view').select('*');
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id) {
    const { data: sow, error: sErr } = await supabase
      .from('sows_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sow) return null;

    const { data: items, error: iErr } = await supabase
      .from('sow_items')
      .select('*')
      .eq('sow_id', id)
      .order('id');
    if (iErr) throw new Error(iErr.message);

    return { ...sow, items };
  },

  async generateSowNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pattern = `SOW-${today}-%`;
    const { count, error } = await supabase
      .from('sows')
      .select('*', { count: 'exact', head: true })
      .like('sow_number', pattern);
    if (error) throw new Error(error.message);
    const seq = String((count || 0) + 1).padStart(3, '0');
    return `SOW-${today}-${seq}`;
  },

  async create(sow, items) {
    const sowNumber = await SOWModel.generateSowNumber();
    const totalValue = items.reduce((sum, item) => sum + item.amount, 0);

    const { data: row, error: sErr } = await supabase
      .from('sows')
      .insert({
        sow_number: sowNumber,
        client_id: sow.client_id,
        quote_id: sow.quote_id || null,
        sow_date: sow.sow_date,
        effective_start: sow.effective_start,
        effective_end: sow.effective_end,
        total_value: totalValue,
        status: 'Draft',
        notes: sow.notes || null,
      })
      .select('id')
      .single();
    if (sErr) throw new Error(sErr.message);

    const sowId = row.id;
    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        sow_id: sowId,
        role_position: item.role_position,
        quantity: item.quantity,
        amount: item.amount,
      }));
      const { error: iErr } = await supabase.from('sow_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    return { id: sowId, sow_number: sowNumber };
  },

  async update(id, sow, items) {
    const totalValue = items.reduce((sum, item) => sum + item.amount, 0);

    const { error: sErr } = await supabase
      .from('sows')
      .update({
        client_id: sow.client_id,
        quote_id: sow.quote_id || null,
        sow_date: sow.sow_date,
        effective_start: sow.effective_start,
        effective_end: sow.effective_end,
        total_value: totalValue,
        notes: sow.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (sErr) throw new Error(sErr.message);

    // Delete old items and insert new ones
    const { error: dErr } = await supabase.from('sow_items').delete().eq('sow_id', id);
    if (dErr) throw new Error(dErr.message);

    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        sow_id: id,
        role_position: item.role_position,
        quantity: item.quantity,
        amount: item.amount,
      }));
      const { error: iErr } = await supabase.from('sow_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }
  },

  async updateStatus(id, status) {
    const { error } = await supabase
      .from('sows')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async delete(id) {
    const { error } = await supabase.from('sows').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = SOWModel;
