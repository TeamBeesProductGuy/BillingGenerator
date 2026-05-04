const PermanentReminderModel = require('../models/permanentReminder.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');
const { sendPaymentReminderEmail } = require('../services/graphMail.service');
const { logActivity } = require('../services/activityLog.service');

const permanentReminderController = {
  listOpen: catchAsync(async (req, res) => {
    await PermanentReminderModel.closeCompletedOpenReminders();
    const reminders = await PermanentReminderModel.findAll();
    res.json({ success: true, data: reminders });
  }),

  updateEmails: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.updateEmails(id, req.body.email_primary, req.body.email_secondary);
    const updated = await PermanentReminderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_reminders',
      action: 'update_emails',
      entityType: 'permanent_reminder',
      entityId: id,
      entityLabel: updated && updated.order ? updated.order.candidate_name : 'Reminder #' + id,
      details: { summary: 'Updated reminder emails' },
    });
    res.json({ success: true, data: updated });
  }),

  updatePaymentStatus: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');

    await PermanentReminderModel.updatePaymentStatus(id, req.body.payment_status);
    const updated = await PermanentReminderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_reminders',
      action: 'payment_status',
      entityType: 'permanent_reminder',
      entityId: id,
      entityLabel: updated && updated.order ? updated.order.candidate_name : 'Reminder #' + id,
      details: { summary: 'Marked payment status as ' + req.body.payment_status },
    });
    res.json({ success: true, data: updated });
  }),

  markInvoiceSent: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.markInvoiceSent(id, req.body.invoice_number, req.body.invoice_date);
    const updated = await PermanentReminderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_reminders',
      action: 'invoice_sent',
      entityType: 'permanent_reminder',
      entityId: id,
      entityLabel: updated && updated.order ? updated.order.candidate_name : 'Reminder #' + id,
      details: { summary: 'Saved invoice details', invoice_number: req.body.invoice_number, invoice_date: req.body.invoice_date },
    });
    res.json({ success: true, data: updated });
  }),

  sendMail: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');
    if (existing.payment_status === 'paid') throw new AppError(400, 'Reminder is already marked as paid');

    try {
      await sendPaymentReminderEmail([existing]);
      await PermanentReminderModel.markBatchSent([id]);
    } catch (error) {
      await PermanentReminderModel.markBatchFailed([id], error.message);
      throw new AppError(502, error.message);
    }

    const updated = await PermanentReminderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_reminders',
      action: 'send_mail',
      entityType: 'permanent_reminder',
      entityId: id,
      entityLabel: updated && updated.order ? updated.order.candidate_name : 'Reminder #' + id,
      details: { summary: 'Sent reminder email' },
    });
    res.json({
      success: true,
      data: updated,
      warning: !Object.prototype.hasOwnProperty.call(updated || {}, 'payment_status')
        ? 'Email sent, but reminder mail tracking columns are not in Supabase yet. Run migration 010 to enable payment status and send counts.'
        : undefined,
    });
  }),

  close: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.close(id);
    const updated = await PermanentReminderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_reminders',
      action: 'close',
      entityType: 'permanent_reminder',
      entityId: id,
      entityLabel: updated && updated.order ? updated.order.candidate_name : 'Reminder #' + id,
      details: { summary: 'Closed reminder' },
    });
    res.json({ success: true, data: updated });
  }),

  extend: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.extend(id, req.body.due_date);
    const updated = await PermanentReminderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_reminders',
      action: 'extend',
      entityType: 'permanent_reminder',
      entityId: id,
      entityLabel: updated && updated.order ? updated.order.candidate_name : 'Reminder #' + id,
      details: { summary: 'Extended reminder due date to ' + req.body.due_date },
    });
    res.json({ success: true, data: updated });
  }),
};

module.exports = permanentReminderController;
