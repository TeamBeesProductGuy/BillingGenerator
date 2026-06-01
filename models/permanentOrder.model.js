const { adminSupabase } = require('../config/database');

const TABLE = 'permanent_orders';
const CANCELLED_ORDER_MARKER = /^\[CANCELLED_ORDER:([^\]]+)\]\s*/;

function isMissingCancellationColumn(error) {
  return Boolean(
    error &&
    (
      error.code === '42703' ||
      /is_cancelled|cancelled_at|cancellation_reason/i.test(error.message || '')
    )
  );
}

function stripCancellationMarker(value) {
  return String(value || '').replace(CANCELLED_ORDER_MARKER, '').trim();
}

function normalizeCancelledOrder(order) {
  if (!order) return order;
  const markerMatch = String(order.remarks || '').match(CANCELLED_ORDER_MARKER);
  if (!markerMatch) {
    return {
      ...order,
      is_cancelled: Boolean(order.is_cancelled),
    };
  }

  return {
    ...order,
    is_cancelled: true,
    cancelled_at: order.cancelled_at || markerMatch[1],
    cancellation_reason: order.cancellation_reason || 'Cancelled order archive',
    remarks: stripCancellationMarker(order.remarks),
  };
}

async function mapOrdersWithClients(orders) {
  if (!orders || orders.length === 0) return [];
  const clientIds = Array.from(new Set(orders.map((o) => o.client_id)));
  const { data: clients, error } = await adminSupabase
    .from('permanent_clients')
    .select('id, client_name, abbreviation, billing_pattern, billing_rate, address')
    .in('id', clientIds);
  if (error) throw new Error(error.message);

  const clientMap = {};
  (clients || []).forEach((client) => {
    clientMap[client.id] = client;
  });

  const orderIds = Array.from(new Set(orders.map((order) => order.id)));
  let reminders = [];
  if (orderIds.length > 0) {
    const reminderResult = await adminSupabase
      .from('permanent_reminders')
      .select('id, order_id, status, due_date, invoice_status, invoice_number, invoice_date, payment_status')
      .in('order_id', orderIds)
      .order('id', { ascending: false });
    if (reminderResult.error) throw new Error(reminderResult.error.message);
    reminders = reminderResult.data || [];
  }

  const reminderMap = {};
  reminders.forEach((reminder) => {
    if (!reminderMap[reminder.order_id]) reminderMap[reminder.order_id] = reminder;
  });

  return orders.map((order) => ({
    ...normalizeCancelledOrder(order),
    client: clientMap[order.client_id] || null,
    reminder: reminderMap[order.id] || null,
  }));
}

const PermanentOrderModel = {
  async findAll(clientIds) {
    let query = adminSupabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (Array.isArray(clientIds)) {
      if (clientIds.length === 0) return [];
      query = query.in('client_id', clientIds);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return mapOrdersWithClients(data || []);
  },

  async findById(id) {
    const { data, error } = await adminSupabase
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
    const { data: row, error } = await adminSupabase
      .from(TABLE)
      .insert({
        client_id: data.client_id,
        candidate_name: data.candidate_name,
        requisition_description: data.requisition_description || null,
        position_role: data.position_role,
        date_of_offer: data.date_of_offer || null,
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
    const { error } = await adminSupabase
      .from(TABLE)
      .update({
        client_id: data.client_id,
        candidate_name: data.candidate_name,
        requisition_description: data.requisition_description || null,
        position_role: data.position_role,
        date_of_offer: data.date_of_offer || null,
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

  async cancel(id, existing) {
    const now = new Date().toISOString();
    const { error } = await adminSupabase
      .from(TABLE)
      .update({
        is_cancelled: true,
        cancelled_at: now,
        cancellation_reason: 'Deleted from orders UI',
        updated_at: now,
      })
      .eq('id', id);

    if (isMissingCancellationColumn(error)) {
      const remarks = stripCancellationMarker(existing && existing.remarks);
      const fallbackRemarks = '[CANCELLED_ORDER:' + now + ']' + (remarks ? '\n' + remarks : '');
      const fallback = await adminSupabase
        .from(TABLE)
        .update({
          remarks: fallbackRemarks,
          updated_at: now,
        })
        .eq('id', id);
      if (fallback.error) throw new Error(fallback.error.message);
      return;
    }

    if (error) throw new Error(error.message);
  },
};

module.exports = PermanentOrderModel;
