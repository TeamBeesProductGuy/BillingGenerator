const { supabase } = require('../config/database');

const TABLE = 'permanent_orders';

async function mapOrdersWithClients(orders) {
  if (!orders || orders.length === 0) return [];
  const clientIds = Array.from(new Set(orders.map((o) => o.client_id)));
  const { data: clients, error } = await supabase
    .from('permanent_clients')
    .select('id, client_name, abbreviation, billing_pattern, billing_rate, address')
    .in('id', clientIds);
  if (error) throw new Error(error.message);

  const clientMap = {};
  (clients || []).forEach((client) => {
    clientMap[client.id] = client;
  });

  return orders.map((order) => ({
    ...order,
    client: clientMap[order.client_id] || null,
  }));
}

const PermanentOrderModel = {
  async findAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return mapOrdersWithClients(data || []);
  },

  async findById(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const rows = await mapOrdersWithClients([data]);
    return rows[0] || null;
  },

  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        client_id: data.client_id,
        candidate_name: data.candidate_name,
        position_role: data.position_role,
        date_of_joining: data.date_of_joining,
        ctc_offered: data.ctc_offered,
        bill_amount: data.bill_amount,
        next_bill_date: data.next_bill_date,
        remarks: data.remarks || null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return row.id;
  },

  async update(id, data) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        client_id: data.client_id,
        candidate_name: data.candidate_name,
        position_role: data.position_role,
        date_of_joining: data.date_of_joining,
        ctc_offered: data.ctc_offered,
        bill_amount: data.bill_amount,
        next_bill_date: data.next_bill_date,
        remarks: data.remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async remove(id) {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = PermanentOrderModel;
