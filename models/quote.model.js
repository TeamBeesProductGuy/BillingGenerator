const { supabase } = require('../config/database');

function buildQuoteRevisionNumber(baseQuoteNumber, versionNumber) {
  return `${baseQuoteNumber} R(${versionNumber})`;
}

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes('column') && error.message.includes(columnName));
}

function buildQuoteInsertPayload(quoteNumber, quote, totalAmount) {
  return {
    quote_number: quoteNumber,
    base_quote_number: quote.base_quote_number,
    version_number: quote.version_number,
    parent_quote_id: quote.parent_quote_id || null,
    is_latest: quote.is_latest !== false,
    client_id: quote.client_id,
    quote_date: quote.quote_date,
    valid_until: quote.valid_until,
    status: quote.status || 'Draft',
    total_amount: totalAmount,
    notes: quote.notes || null,
  };
}

const QuoteModel = {
  async findAll(clientId, status) {
    let query = supabase.from('quotes_view').select('*').eq('is_latest', true);
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    let { data, error } = await query;

    if (isMissingColumnError(error, 'is_latest')) {
      let fallbackQuery = supabase.from('quotes_view').select('*');
      if (clientId) fallbackQuery = fallbackQuery.eq('client_id', clientId);
      if (status) fallbackQuery = fallbackQuery.eq('status', status);
      fallbackQuery = fallbackQuery.order('created_at', { ascending: false });
      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id) {
    const { data: quote, error: qErr } = await supabase
      .from('quotes_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);
    if (!quote) return null;

    const { data: items, error: iErr } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('id');
    if (iErr) throw new Error(iErr.message);

    return { ...quote, items };
  },

  async generateQuoteNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pattern = `Q-${today}-%`;
    const { count, error } = await supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .like('quote_number', pattern);
    if (error) throw new Error(error.message);
    const seq = String((count || 0) + 1).padStart(3, '0');
    return `Q-${today}-${seq}`;
  },

  async create(quote, items) {
    const quoteNumber = quote.quote_number || await QuoteModel.generateQuoteNumber();
    const totalAmount = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const baseQuoteNumber = quote.base_quote_number || quoteNumber;
    const versionNumber = quote.version_number || 0;
    const insertPayload = buildQuoteInsertPayload(quoteNumber, {
      ...quote,
      base_quote_number: baseQuoteNumber,
      version_number: versionNumber,
    }, totalAmount);

    let { data: row, error: qErr } = await supabase
      .from('quotes')
      .insert(insertPayload)
      .select('id')
      .single();

    if (isMissingColumnError(qErr, 'base_quote_number')
      || isMissingColumnError(qErr, 'version_number')
      || isMissingColumnError(qErr, 'parent_quote_id')
      || isMissingColumnError(qErr, 'is_latest')) {
      ({ data: row, error: qErr } = await supabase
        .from('quotes')
        .insert({
          quote_number: quoteNumber,
          client_id: quote.client_id,
          quote_date: quote.quote_date,
          valid_until: quote.valid_until,
          status: quote.status || 'Draft',
          total_amount: totalAmount,
          notes: quote.notes || null,
        })
        .select('id')
        .single());
    }
    if (qErr) throw new Error(qErr.message);

    const quoteId = row.id;
    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        quote_id: quoteId,
        description: item.description,
        quantity: item.quantity,
        unit_rate: item.unit_rate,
        amount: item.amount,
        emp_code: item.emp_code || null,
        location: item.location || null,
      }));
      const { error: iErr } = await supabase.from('quote_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    return { id: quoteId, quote_number: quoteNumber };
  },

  async update(id, quote, items) {
    const existing = await QuoteModel.findById(id);
    if (!existing) throw new Error('Quote not found');

    if (existing.base_quote_number === undefined || existing.version_number === undefined || existing.is_latest === undefined) {
      const totalAmount = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

      const { error: qErr } = await supabase
        .from('quotes')
        .update({
          client_id: quote.client_id,
          quote_date: quote.quote_date,
          valid_until: quote.valid_until,
          total_amount: totalAmount,
          notes: quote.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (qErr) throw new Error(qErr.message);

      const { error: dErr } = await supabase.from('quote_items').delete().eq('quote_id', id);
      if (dErr) throw new Error(dErr.message);

      if (items.length > 0) {
        const itemRows = items.map((item) => ({
          quote_id: id,
          description: item.description,
          quantity: item.quantity,
          unit_rate: item.unit_rate,
          amount: item.amount,
          emp_code: item.emp_code || null,
          location: item.location || null,
        }));
        const { error: iErr } = await supabase.from('quote_items').insert(itemRows);
        if (iErr) throw new Error(iErr.message);
      }

      return { id, quote_number: existing.quote_number };
    }

    const baseQuoteNumber = existing.base_quote_number || existing.quote_number;
    const versionNumber = (existing.version_number || 0) + 1;
    const quoteNumber = buildQuoteRevisionNumber(baseQuoteNumber, versionNumber);

    const created = await QuoteModel.create({
      client_id: quote.client_id,
      quote_date: quote.quote_date,
      valid_until: quote.valid_until,
      notes: quote.notes,
      quote_number: quoteNumber,
      base_quote_number: baseQuoteNumber,
      version_number: versionNumber,
      parent_quote_id: id,
      status: 'Draft',
    }, items);

    const { error: archiveErr } = await supabase
      .from('quotes')
      .update({
        is_latest: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (archiveErr) throw new Error(archiveErr.message);

    return created;
  },

  async updateStatus(id, status) {
    const { error } = await supabase
      .from('quotes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async delete(id) {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = QuoteModel;
