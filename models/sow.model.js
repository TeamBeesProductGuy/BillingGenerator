const { supabase } = require('../config/database');

function buildSowRevisionNumber(baseSowNumber, versionNumber) {
  return `${baseSowNumber} A(${versionNumber})`;
}

function normalizeSowStatus(row) {
  if (!row) return row;
  if (Array.isArray(row)) return row.map(normalizeSowStatus);
  return {
    ...row,
    status: row.status === 'Active' ? 'Signed' : row.status,
  };
}

function toDatabaseSowStatus(status) {
  return status === 'Signed' ? 'Active' : status;
}

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes(`column`) && error.message.includes(columnName));
}

const SOWModel = {
  async findAll(clientId, status) {
    let query = supabase.from('sows_view').select('*').eq('is_latest', true);
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', toDatabaseSowStatus(status));
    query = query.order('created_at', { ascending: false });
    let { data, error } = await query;

    if (isMissingColumnError(error, 'is_latest')) {
      let fallbackQuery = supabase.from('sows_view').select('*');
      if (clientId) fallbackQuery = fallbackQuery.eq('client_id', clientId);
      if (status) fallbackQuery = fallbackQuery.eq('status', toDatabaseSowStatus(status));
      fallbackQuery = fallbackQuery.order('created_at', { ascending: false });
      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return normalizeSowStatus(data);
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

    return normalizeSowStatus({ ...sow, items });
  },

  async create(sow, items) {
    const sowNumber = sow.sow_number;
    const totalValue = items.reduce((sum, item) => sum + item.amount, 0);
    const baseSowNumber = sow.base_sow_number || sowNumber;
    const versionNumber = sow.version_number || 0;

    const { data: row, error: sErr } = await supabase
      .from('sows')
      .insert({
        sow_number: sowNumber,
        base_sow_number: baseSowNumber,
        version_number: versionNumber,
        parent_sow_id: sow.parent_sow_id || null,
        is_latest: sow.is_latest !== false,
        client_id: sow.client_id,
        quote_id: sow.quote_id || null,
        sow_date: sow.sow_date,
        effective_start: sow.effective_start,
        effective_end: sow.effective_end,
        total_value: totalValue,
        status: toDatabaseSowStatus(sow.status || 'Draft'),
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
    const existing = await SOWModel.findById(id);
    if (!existing) throw new Error('SOW not found');

    const baseSowNumber = existing.base_sow_number || existing.sow_number;
    const versionNumber = (existing.version_number || 0) + 1;
    const sowNumber = buildSowRevisionNumber(baseSowNumber, versionNumber);

    const created = await SOWModel.create({
      sow_number: sowNumber,
      base_sow_number: baseSowNumber,
      version_number: versionNumber,
      parent_sow_id: id,
      client_id: sow.client_id,
      quote_id: sow.quote_id || null,
      sow_date: sow.sow_date,
      effective_start: sow.effective_start,
      effective_end: sow.effective_end,
      notes: sow.notes || null,
      status: 'Draft',
    }, items);

    const { error: archiveErr } = await supabase
      .from('sows')
      .update({
        is_latest: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (archiveErr) throw new Error(archiveErr.message);

    return created;
  },

  async linkQuote(id, quoteId) {
    const { error } = await supabase
      .from('sows')
      .update({ quote_id: quoteId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async updateStatus(id, status) {
    const { error } = await supabase
      .from('sows')
      .update({ status: toDatabaseSowStatus(status), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async delete(id) {
    const { error } = await supabase.from('sows').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = SOWModel;
