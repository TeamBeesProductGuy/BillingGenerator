const { supabase, adminSupabase } = require('../config/database');

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
  return status;
}

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes(`column`) && error.message.includes(columnName));
}

function isMissingRelationError(error, relationName) {
  return Boolean(
    error &&
    error.message &&
    error.message.toLowerCase().indexOf('relation') !== -1 &&
    error.message.toLowerCase().indexOf(String(relationName || '').toLowerCase()) !== -1
  );
}

async function getNextRevisionNumber(baseSowNumber) {
  const { data, error } = await supabase
    .from('sows')
    .select('version_number')
    .eq('base_sow_number', baseSowNumber)
    .order('version_number', { ascending: false })
    .limit(1);

  if (isMissingColumnError(error, 'base_sow_number') || isMissingColumnError(error, 'version_number')) {
    return 1;
  }
  if (error) throw new Error(error.message);

  const currentMax = Array.isArray(data) && data.length > 0 ? (data[0].version_number || 0) : 0;
  return currentMax + 1;
}

function buildSowInsertPayload(sow, totalValue) {
  return {
    sow_number: sow.sow_number,
    base_sow_number: sow.base_sow_number,
    version_number: sow.version_number,
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
  };
}

const SOWModel = {
  async findAll(clientId, status, options) {
    const includeLinked = Boolean(options && options.includeLinked && clientId);
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
    let rows = Array.isArray(data) ? data.slice() : [];

    if (includeLinked) {
      const { data: links, error: linkErr } = await adminSupabase
        .from('sow_client_links')
        .select('sow_id')
        .eq('linked_client_id', clientId);
      if (linkErr && !isMissingRelationError(linkErr, 'sow_client_links')) throw new Error(linkErr.message);

      const linkedIds = Array.from(new Set(((links || [])).map((row) => row.sow_id).filter(Boolean)));
      const existingIds = new Set(rows.map((row) => row.id));
      const missingIds = linkedIds.filter((id) => !existingIds.has(id));

      if (missingIds.length > 0) {
        let linkedQuery = supabase.from('sows_view').select('*').in('id', missingIds).eq('is_latest', true);
        if (status) linkedQuery = linkedQuery.eq('status', toDatabaseSowStatus(status));
        let linkedResult = await linkedQuery.order('created_at', { ascending: false });

        if (isMissingColumnError(linkedResult.error, 'is_latest')) {
          let legacyQuery = supabase.from('sows_view').select('*').in('id', missingIds);
          if (status) legacyQuery = legacyQuery.eq('status', toDatabaseSowStatus(status));
          linkedResult = await legacyQuery.order('created_at', { ascending: false });
        }

        if (linkedResult.error) throw new Error(linkedResult.error.message);
        rows = rows.concat(linkedResult.data || []);
      }
    }

    return normalizeSowStatus(rows);
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
    const insertPayload = buildSowInsertPayload({
      ...sow,
      base_sow_number: baseSowNumber,
      version_number: versionNumber,
    }, totalValue);

    let { data: row, error: sErr } = await supabase
      .from('sows')
      .insert(insertPayload)
      .select('id')
      .single();

    if (isMissingColumnError(sErr, 'base_sow_number')
      || isMissingColumnError(sErr, 'version_number')
      || isMissingColumnError(sErr, 'parent_sow_id')
      || isMissingColumnError(sErr, 'is_latest')) {
      ({ data: row, error: sErr } = await supabase
        .from('sows')
        .insert({
          sow_number: sowNumber,
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
        .single());
    }
    if (sErr) throw new Error(sErr.message);

    const sowId = row.id;
    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        sow_id: sowId,
        role_position: item.role_position,
        quantity: item.quantity,
        amount: item.amount,
        valid_from: item.valid_from || sow.effective_start,
        valid_to: item.valid_to || sow.effective_end,
      }));
      const { error: iErr } = await supabase.from('sow_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    return { id: sowId, sow_number: sowNumber };
  },

  async update(id, sow, items) {
    const existing = await SOWModel.findById(id);
    if (!existing) throw new Error('SOW not found');

    if (existing.base_sow_number === undefined || existing.version_number === undefined || existing.is_latest === undefined) {
      const totalValue = items.reduce((sum, item) => sum + item.amount, 0);

      const { error: sErr } = await supabase
        .from('sows')
        .update({
          sow_number: sow.sow_number,
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

      const { error: dErr } = await supabase.from('sow_items').delete().eq('sow_id', id);
      if (dErr) throw new Error(dErr.message);

      if (items.length > 0) {
        const itemRows = items.map((item) => ({
          sow_id: id,
          role_position: item.role_position,
          quantity: item.quantity,
          amount: item.amount,
          valid_from: item.valid_from || sow.effective_start,
          valid_to: item.valid_to || sow.effective_end,
        }));
        const { error: iErr } = await supabase.from('sow_items').insert(itemRows);
        if (iErr) throw new Error(iErr.message);
      }

      return { id, sow_number: existing.sow_number };
    }

    const baseSowNumber = existing.base_sow_number || existing.sow_number;
    const versionNumber = await getNextRevisionNumber(baseSowNumber);
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
      status: existing.status || 'Draft',
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

  async createAmendment(id, sow, items) {
    const existing = await SOWModel.findById(id);
    if (!existing) throw new Error('SOW not found');

    const baseSowNumber = existing.base_sow_number || existing.sow_number;
    const versionNumber = await getNextRevisionNumber(baseSowNumber);
    const sowNumber = buildSowRevisionNumber(baseSowNumber, versionNumber);

    return SOWModel.create({
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
      status: 'Amendment Draft',
    }, items);
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

  async getAssociations(id) {
    const [poResult, rateCardResult] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, po_number, status')
        .eq('sow_id', id)
        .neq('status', 'Inactive')
        .order('created_at', { ascending: false }),
      supabase
        .from('rate_cards')
        .select('id, emp_code, emp_name, po_id')
        .eq('sow_id', id)
        .eq('is_active', true),
    ]);
    if (poResult.error) throw new Error(poResult.error.message);
    if (rateCardResult.error) throw new Error(rateCardResult.error.message);
    return {
      purchaseOrders: poResult.data || [],
      rateCards: rateCardResult.data || [],
    };
  },

  async delete(id) {
    const { error } = await supabase.from('sows').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async hasClientLink(sowId, clientId) {
    const { data, error } = await adminSupabase
      .from('sow_client_links')
      .select('id')
      .eq('sow_id', sowId)
      .eq('linked_client_id', clientId)
      .maybeSingle();
    if (error && isMissingRelationError(error, 'sow_client_links')) return false;
    if (error) throw new Error(error.message);
    return Boolean(data);
  },

  async ensureClientLink(sowId, linkedClientId) {
    const existing = await SOWModel.hasClientLink(sowId, linkedClientId);
    if (existing) return;
    const { error } = await adminSupabase
      .from('sow_client_links')
      .insert({
        sow_id: sowId,
        linked_client_id: linkedClientId,
      });
    if (error && isMissingRelationError(error, 'sow_client_links')) {
      throw new Error('The sow_client_links table is missing. Run the Supabase SQL migration for cross-client SOW linking first.');
    }
    if (error) throw new Error(error.message);
  },
};

module.exports = SOWModel;
