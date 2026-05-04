const { supabase } = require('../config/database');

function isMissingFunctionError(error, functionName) {
  return Boolean(error && error.message && error.message.toLowerCase().includes(functionName.toLowerCase()));
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : '');
  return Boolean(error && (error.code === '23505' || message.includes('duplicate key') || message.includes('UNIQUE')));
}

function extractStructuredField(notes, label, nextLabels) {
  const raw = String(notes || '');
  const escapedLabel = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lookAhead = (nextLabels || []).map((item) => `\\n${String(item || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`).join('|');
  const endOfInput = '(?![\\s\\S])';
  const pattern = new RegExp(`^\\s*${escapedLabel}:\\s*\\n?([\\s\\S]*?)(?=${lookAhead || endOfInput}|${endOfInput})`, 'im');
  const match = raw.match(pattern);
  return match ? match[1].trim() : '';
}

function uniqueStrings(values) {
  const seen = new Set();
  return (values || []).filter((value) => {
    const normalized = String(value || '').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enrichPurchaseOrders(rows) {
  const items = Array.isArray(rows) ? rows : [];
  if (items.length === 0) return items;

  const clientIds = uniqueStrings(items.map((row) => row.client_id));
  const quoteIds = uniqueStrings(items.map((row) => row.quote_id));
  const sowIds = uniqueStrings(items.map((row) => row.sow_id));

  const [clientsResult, quotesResult, sowItemsResult] = await Promise.all([
    clientIds.length > 0
      ? supabase.from('clients').select('id, abbreviation, client_name').in('id', clientIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length > 0
      ? supabase.from('quotes').select('id, notes').in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
    sowIds.length > 0
      ? supabase.from('sow_items').select('sow_id, role_position').in('sow_id', sowIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (clientsResult.error) throw new Error(clientsResult.error.message);
  if (quotesResult.error) throw new Error(quotesResult.error.message);
  if (sowItemsResult.error) throw new Error(sowItemsResult.error.message);

  const clientMap = {};
  (clientsResult.data || []).forEach((client) => {
    clientMap[String(client.id)] = client;
  });

  const quoteMap = {};
  (quotesResult.data || []).forEach((quote) => {
    quoteMap[String(quote.id)] = {
      candidate_name: extractStructuredField(quote.notes, 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']) || '',
      designation: extractStructuredField(quote.notes, 'Designation', ['Dear', 'Body', 'Regards']) || '',
    };
  });

  const sowRoleMap = {};
  (sowItemsResult.data || []).forEach((item) => {
    const key = String(item.sow_id);
    if (!sowRoleMap[key]) sowRoleMap[key] = [];
    sowRoleMap[key].push(item.role_position);
  });

  return items.map((row) => {
    const client = clientMap[String(row.client_id)] || {};
    const quote = quoteMap[String(row.quote_id)] || {};
    const roles = uniqueStrings(sowRoleMap[String(row.sow_id)] || []);
    return {
      ...row,
      client_abbreviation: client.abbreviation || row.client_name || '',
      candidate_name: quote.candidate_name || '',
      role_summary: roles.join(', ') || quote.designation || '',
    };
  });
}

const POModel = {
  async generatePONumber(offset = 0) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const today = `${day}${month}${year}`;
    const pattern = `PO-${today}-%`;
    const { count, error } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .like('po_number', pattern);
    if (error) throw new Error(error.message);
    const seq = String((count || 0) + 1 + offset).padStart(3, '0');
    return `PO-${today}-${seq}`;
  },

  async findAll(clientId, status) {
    let query = supabase.from('purchase_orders_view').select('*');
    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return enrichPurchaseOrders(data || []);
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

    const [enriched] = await enrichPurchaseOrders([{ ...po, consumptionLog: logResult.data, linkedEmployees: empResult.data }]);
    return enriched;
  },

  async findByNumber(poNumber) {
    const { data, error } = await supabase
      .from('purchase_orders_view')
      .select('*')
      .eq('po_number', poNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(data) {
    const maxAttempts = data.po_number ? 1 : 25;
    let poNumber = data.po_number || null;
    let row;
    let error;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateNumber = poNumber || await POModel.generatePONumber(attempt);
      ({ data: row, error } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: candidateNumber,
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
        .single());

      if (!error) {
        poNumber = candidateNumber;
        break;
      }

      if (!isDuplicateKeyError(error) || data.po_number) {
        throw new Error(error.message);
      }
    }

    if (error) throw new Error(error.message);
    return { id: row.id, po_number: poNumber };
  },

  async update(id, data) {
    const payload = {
      client_id: data.client_id,
      po_date: data.po_date,
      start_date: data.start_date,
      end_date: data.end_date,
      po_value: data.po_value,
      alert_threshold: data.alert_threshold || 80,
      sow_id: data.sow_id || null,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (data.po_number) payload.po_number = data.po_number;

    const { error } = await supabase
      .from('purchase_orders')
      .update(payload)
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async addConsumption(poId, amount, description, billingRunId) {
    let { error } = await supabase.rpc('consume_po', {
      p_po_id: poId,
      p_amount: amount,
      p_description: description || null,
      p_billing_run_id: billingRunId || null,
    });
    if (error && isMissingFunctionError(error, 'consume_po')) {
      const po = await this.findById(poId);
      if (!po) throw new Error(`PO ${poId} not found`);

      const [logResult, poResult] = await Promise.all([
        supabase.from('po_consumption_log').insert({
          po_id: poId,
          billing_run_id: billingRunId || null,
          amount,
          description: description || null,
        }),
        supabase
          .from('purchase_orders')
          .update({
            consumed_value: Number(po.consumed_value || 0) + Number(amount || 0),
            updated_at: new Date().toISOString(),
          })
          .eq('id', poId),
      ]);

      if (logResult.error) throw new Error(logResult.error.message);
      if (poResult.error) throw new Error(poResult.error.message);

      const updatedPo = await this.findById(poId);
      if (updatedPo && Number(updatedPo.consumed_value || 0) >= Number(updatedPo.po_value || 0)) {
        const { error: exhaustError } = await supabase
          .from('purchase_orders')
          .update({ status: 'Exhausted', updated_at: new Date().toISOString() })
          .eq('id', poId);
        if (exhaustError) throw new Error(exhaustError.message);
      }
      return;
    }
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

  async updateStatus(id, status) {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getAssociations(id) {
    const [poResult, rateCardResult] = await Promise.all([
      supabase
        .from('purchase_orders_view')
        .select('id, sow_id, sow_number')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('rate_cards_view')
        .select('id, emp_code, emp_name, sow_id, sow_number')
        .eq('po_id', id)
        .eq('is_active', true),
    ]);
    if (poResult.error) throw new Error(poResult.error.message);
    if (rateCardResult.error) throw new Error(rateCardResult.error.message);

    const sowMap = new Map();
    if (poResult.data && poResult.data.sow_id) {
      sowMap.set(String(poResult.data.sow_id), {
        id: poResult.data.sow_id,
        sow_number: poResult.data.sow_number,
      });
    }
    (rateCardResult.data || []).forEach((row) => {
      if (!row.sow_id) return;
      sowMap.set(String(row.sow_id), {
        id: row.sow_id,
        sow_number: row.sow_number,
      });
    });

    return {
      sows: Array.from(sowMap.values()),
      rateCards: rateCardResult.data || [],
    };
  },
};

module.exports = POModel;
