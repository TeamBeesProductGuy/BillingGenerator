const { supabase } = require('../config/database');

function buildQuoteRevisionNumber(baseQuoteNumber, versionNumber) {
  return `${baseQuoteNumber}/${versionNumber}`;
}

function normalizeBaseQuoteNumber(value) {
  return String(value || '')
    .replace(/\s+R\(\d+\)\s*$/i, '')
    .replace(/\/\d+\s*$/i, '')
    .trim();
}

function getFinancialYearCode(dateValue) {
  const parsed = new Date(dateValue);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return String(startYear).slice(-2) + String(endYear).slice(-2);
}

function toIsoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes('column') && error.message.includes(columnName));
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : '');
  return Boolean(error && (error.code === '23505' || message.includes('duplicate key') || message.includes('UNIQUE')));
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

function buildLegacyInsertPayload(quoteNumber, quote, totalAmount) {
  return {
    quote_number: quoteNumber,
    client_id: quote.client_id,
    quote_date: quote.quote_date,
    valid_until: quote.valid_until,
    status: quote.status || 'Draft',
    total_amount: totalAmount,
    notes: quote.notes || null,
  };
}

async function attachQuoteItemSummaries(quotes) {
  if (!quotes || quotes.length === 0) return quotes || [];
  const quoteIds = Array.from(new Set(quotes.map((quote) => quote.id).filter(Boolean)));
  if (quoteIds.length === 0) return quotes;

  const { data: items, error } = await supabase
    .from('quote_items')
    .select('quote_id, description')
    .in('quote_id', quoteIds)
    .order('id');
  if (error) throw new Error(error.message);

  const summaryMap = {};
  (items || []).forEach((item) => {
    if (!summaryMap[item.quote_id]) summaryMap[item.quote_id] = [];
    if (item.description) summaryMap[item.quote_id].push(item.description);
  });

  return quotes.map((quote) => ({
    ...quote,
    item_descriptions: summaryMap[quote.id] || [],
    primary_description: (summaryMap[quote.id] && summaryMap[quote.id][0]) || '',
  }));
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
    return attachQuoteItemSummaries(data || []);
  },

  async findRegister(clientId, status) {
    let query = supabase.from('quotes_view').select('*').eq('version_number', 0);
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    let { data, error } = await query;

    if (isMissingColumnError(error, 'version_number')) {
      return QuoteModel.findAll(clientId, status);
    }

    if (error) throw new Error(error.message);
    return attachQuoteItemSummaries(data || []);
  },

  async findAmendments(clientId, status) {
    let query = supabase.from('quotes_view').select('*').gt('version_number', 0);
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    let { data, error } = await query;
    if (isMissingColumnError(error, 'version_number')) {
      return [];
    }
    if (error) throw new Error(error.message);
    return attachQuoteItemSummaries(data || []);
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

  async generateQuoteNumber(quoteDate, offset = 0) {
    const fyCode = getFinancialYearCode(quoteDate);
    const pattern = `TBC-${fyCode}-%`;
    let data;
    let error;

    ({ data, error } = await supabase
      .from('quotes')
      .select('quote_number, base_quote_number')
      .like('quote_number', pattern));

    if (isMissingColumnError(error, 'base_quote_number')) {
      ({ data, error } = await supabase
        .from('quotes')
        .select('quote_number')
        .like('quote_number', pattern));
    }

    if (error) throw new Error(error.message);

    const baseNumbers = new Set((data || []).map((row) => normalizeBaseQuoteNumber(row.base_quote_number || row.quote_number)));
    const seq = String(baseNumbers.size + 1 + offset).padStart(3, '0');
    return `TBC-${fyCode}-${seq}`;
  },

  async create(quote, items) {
    const totalAmount = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const maxAttempts = quote.quote_number ? 1 : 25;
    let quoteNumber = quote.quote_number || null;
    let row;
    let qErr;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateNumber = quoteNumber || await QuoteModel.generateQuoteNumber(quote.quote_date, attempt);
      const baseQuoteNumber = quote.base_quote_number || candidateNumber;
      const versionNumber = quote.version_number || 0;
      const insertPayload = buildQuoteInsertPayload(candidateNumber, {
        ...quote,
        base_quote_number: baseQuoteNumber,
        version_number: versionNumber,
      }, totalAmount);

      ({ data: row, error: qErr } = await supabase
        .from('quotes')
        .insert(insertPayload)
        .select('id')
        .single());

      if (isMissingColumnError(qErr, 'base_quote_number')
        || isMissingColumnError(qErr, 'version_number')
        || isMissingColumnError(qErr, 'parent_quote_id')
        || isMissingColumnError(qErr, 'is_latest')) {
        ({ data: row, error: qErr } = await supabase
          .from('quotes')
          .insert(buildLegacyInsertPayload(candidateNumber, quote, totalAmount))
          .select('id')
          .single());
      }

      if (!qErr) {
        quoteNumber = candidateNumber;
        break;
      }

      if (!isDuplicateKeyError(qErr) || quote.quote_number) {
        throw new Error(qErr.message);
      }
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
  },

  async createAmendment(id, quote, items) {
    const existing = await QuoteModel.findById(id);
    if (!existing) throw new Error('Quote not found');

    const baseQuoteNumber = normalizeBaseQuoteNumber(existing.base_quote_number || existing.quote_number);
    const versionNumber = (existing.version_number || 0) + 1;
    const quoteNumber = buildQuoteRevisionNumber(baseQuoteNumber, versionNumber);
    const amendmentDate = new Date();
    const validUntilDate = new Date(amendmentDate);
    validUntilDate.setDate(validUntilDate.getDate() + 10);

    const created = await QuoteModel.create({
      client_id: quote.client_id,
      quote_date: toIsoDateOnly(amendmentDate),
      valid_until: toIsoDateOnly(validUntilDate),
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
