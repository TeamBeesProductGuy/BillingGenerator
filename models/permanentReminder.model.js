const { supabase } = require('../config/database');

const TABLE = 'permanent_reminders';

function toISODate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const base = new Date(date);
  base.setDate(base.getDate() + days);
  return base;
}

async function withOrderDetails(reminders) {
  if (!reminders || reminders.length === 0) return [];

  const orderIds = Array.from(new Set(reminders.map((item) => item.order_id)));
  const { data: orders, error } = await supabase
    .from('permanent_orders')
    .select('id, client_id, candidate_name, position_role, next_bill_date, bill_amount, ctc_offered')
    .in('id', orderIds);
  if (error) throw new Error(error.message);

  const clientIds = Array.from(new Set((orders || []).map((order) => order.client_id)));
  let clients = [];
  if (clientIds.length > 0) {
    const result = await supabase
      .from('permanent_clients')
      .select('id, client_name, abbreviation, billing_pattern, billing_rate')
      .in('id', clientIds);
    if (result.error) throw new Error(result.error.message);
    clients = result.data || [];
  }

  const orderMap = {};
  (orders || []).forEach((order) => {
    orderMap[order.id] = order;
  });

  const clientMap = {};
  (clients || []).forEach((client) => {
    clientMap[client.id] = client;
  });

  return reminders.map((reminder) => {
    const order = orderMap[reminder.order_id] || null;
    return {
      ...reminder,
      order,
      client: order ? (clientMap[order.client_id] || null) : null,
    };
  });
}

const PermanentReminderModel = {
  async createForOrder(orderId, dueDate) {
    const { error } = await supabase
      .from(TABLE)
      .insert({
        order_id: orderId,
        due_date: dueDate,
        status: 'Open',
      });
    if (error) throw new Error(error.message);
  },

  async findById(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const rows = await withOrderDetails([data]);
    return rows[0] || null;
  },

  async findOpenByOrderId(orderId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'Open')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const rows = await withOrderDetails([data]);
    return rows[0] || null;
  },

  async findWindowedOpen(referenceDate) {
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    const fromDate = toISODate(addDays(ref, -3));
    const toDate = toISODate(addDays(ref, 3));

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('status', 'Open')
      .gte('due_date', fromDate)
      .lte('due_date', toDate)
      .order('due_date', { ascending: true });
    if (error) throw new Error(error.message);
    return withOrderDetails(data || []);
  },

  async updateEmails(id, emailPrimary, emailSecondary) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        email_primary: emailPrimary || null,
        email_secondary: emailSecondary || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async close(id) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        status: 'Closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async extend(id, newDueDate) {
    const { data: existing, error: existingError } = await supabase
      .from(TABLE)
      .select('extended_count')
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const { error } = await supabase
      .from(TABLE)
      .update({
        due_date: newDueDate,
        extended_count: Number(existing && existing.extended_count ? existing.extended_count : 0) + 1,
        last_extended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = PermanentReminderModel;
