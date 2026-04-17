const { supabase } = require('../config/database');
const env = require('../config/env');

const TABLE = 'permanent_reminders';

function isMissingReminderMailColumn(error) {
  return Boolean(
    error &&
    (
      error.code === '42703' ||
      /payment_status|reminder_sent_at|next_reminder_at|reminder_count|mail_last_status|mail_last_error|invoice_status|invoice_number|invoice_date|invoice_sent_at/i.test(error.message || '')
    )
  );
}

function toISODate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const base = new Date(date);
  base.setDate(base.getDate() + days);
  return base;
}

function addHours(date, hours) {
  const base = new Date(date);
  base.setHours(base.getHours() + hours);
  return base;
}

function calculateInitialReminderAt(dueDate) {
  return addDays(new Date(dueDate), -3).toISOString();
}

async function withOrderDetails(reminders) {
  if (!reminders || reminders.length === 0) return [];

  const orderIds = Array.from(new Set(reminders.map((item) => item.order_id)));
  const { data: orders, error } = await supabase
    .from('permanent_orders')
    .select('id, client_id, candidate_name, requisition_description, position_role, date_of_offer, date_of_joining, next_bill_date, bill_amount, ctc_offered')
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
        payment_status: 'pending',
        next_reminder_at: calculateInitialReminderAt(dueDate),
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

  async updatePaymentStatus(id, paymentStatus) {
    const updates = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (paymentStatus === 'paid') {
      updates.next_reminder_at = null;
      updates.mail_last_status = 'paid';
      updates.mail_last_error = null;
    } else {
      updates.next_reminder_at = addHours(new Date(), env.reminderFrequencyHours).toISOString();
    }

    const { error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id);
    if (isMissingReminderMailColumn(error)) {
      const migrationError = new Error('Reminder mail migration is missing. Run database/migrations/010_add_permanent_reminder_mail_flow.sql in Supabase first.');
      migrationError.statusCode = 400;
      migrationError.isOperational = true;
      throw migrationError;
    }
    if (error) throw new Error(error.message);
  },

  async markInvoiceSent(id, invoiceNumber, invoiceDate) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        invoice_status: 'sent',
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        invoice_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (isMissingReminderMailColumn(error)) {
      const migrationError = new Error('Invoice tracking migration is missing. Run database/migrations/011_add_permanent_invoice_fields.sql in Supabase first.');
      migrationError.statusCode = 400;
      migrationError.isOperational = true;
      throw migrationError;
    }
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
        next_reminder_at: calculateInitialReminderAt(newDueDate),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async findDueForDispatch(referenceDate) {
    const nowIso = new Date(referenceDate || new Date()).toISOString();
    const ref = new Date(referenceDate || new Date());
    const fromDate = toISODate(addDays(ref, -3));
    const toDate = toISODate(addDays(ref, 3));

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('status', 'Open')
      .eq('payment_status', 'pending')
      .gte('due_date', fromDate)
      .lte('due_date', toDate)
      .lte('next_reminder_at', nowIso)
      .order('due_date', { ascending: true });
    if (isMissingReminderMailColumn(error)) return [];
    if (error) throw new Error(error.message);
    return withOrderDetails(data || []);
  },

  async markBatchSent(ids) {
    if (!ids || ids.length === 0) return;

    const now = new Date();
    const { data: existing, error: existingError } = await supabase
      .from(TABLE)
      .select('id, reminder_count')
      .in('id', ids);
    if (existingError) throw new Error(existingError.message);

    for (const row of existing || []) {
      const { error } = await supabase
        .from(TABLE)
        .update({
          reminder_sent_at: now.toISOString(),
          next_reminder_at: addHours(now, env.reminderFrequencyHours).toISOString(),
          reminder_count: Number(row.reminder_count || 0) + 1,
          mail_last_status: 'sent',
          mail_last_error: null,
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      if (isMissingReminderMailColumn(error)) return;
      if (error) throw new Error(error.message);
    }
  },

  async markBatchFailed(ids, message) {
    if (!ids || ids.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .update({
        mail_last_status: 'failed',
        mail_last_error: String(message || 'Unknown mail error').slice(0, 1000),
        updated_at: now,
      })
      .in('id', ids);
    if (isMissingReminderMailColumn(error)) return;
    if (error) throw new Error(error.message);
  },
};

module.exports = PermanentReminderModel;
