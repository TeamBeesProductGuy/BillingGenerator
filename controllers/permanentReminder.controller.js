const PermanentReminderModel = require('../models/permanentReminder.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const permanentReminderController = {
  listWindowedOpen: catchAsync(async (req, res) => {
    const reminders = await PermanentReminderModel.findWindowedOpen(req.query.referenceDate);
    res.json({ success: true, data: reminders });
  }),

  updateEmails: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.updateEmails(id, req.body.email_primary, req.body.email_secondary);
    const updated = await PermanentReminderModel.findById(id);
    res.json({ success: true, data: updated });
  }),

  close: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.close(id);
    const updated = await PermanentReminderModel.findById(id);
    res.json({ success: true, data: updated });
  }),

  extend: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentReminderModel.findById(id);
    if (!existing) throw new AppError(404, 'Reminder not found');
    if (existing.status !== 'Open') throw new AppError(400, 'Reminder is already closed');

    await PermanentReminderModel.extend(id, req.body.due_date);
    const updated = await PermanentReminderModel.findById(id);
    res.json({ success: true, data: updated });
  }),
};

module.exports = permanentReminderController;
