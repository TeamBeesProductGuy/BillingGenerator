const { supabase } = require('../config/database');

const QuoteModel = {
  async findAll(clientId, status) {
    let query = supabase.from('quotes_view').select('*');
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
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
    const quoteNumber = await QuoteModel.generateQuoteNumber();
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = Math.round(subtotal * (quote.tax_percent || 18) / 100 * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    const { data: row, error: qErr } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        client_id: quote.client_id,
        quote_date: quote.quote_date,
        valid_until: quote.valid_until,
        status: 'Draft',
        subtotal,
        tax_percent: quote.tax_percent || 18,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: quote.notes || null,
      })
      .select('id')
      .single();
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
      }));
      const { error: iErr } = await supabase.from('quote_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    return { id: quoteId, quote_number: quoteNumber };
  },

  async update(id, quote, items) {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = Math.round(subtotal * (quote.tax_percent || 18) / 100 * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    const { error: qErr } = await supabase
      .from('quotes')
      .update({
        client_id: quote.client_id,
        quote_date: quote.quote_date,
        valid_until: quote.valid_until,
        subtotal,
        tax_percent: quote.tax_percent || 18,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: quote.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (qErr) throw new Error(qErr.message);

    // Delete old items and insert new ones
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
      }));
      const { error: iErr } = await supabase.from('quote_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }
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
