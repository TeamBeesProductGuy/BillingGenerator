const Joi = require('joi');

module.exports = {
  updateReminderEmails: Joi.object({
    email_primary: Joi.string().email().allow('', null),
    email_secondary: Joi.string().email().allow('', null),
  }),

  updateReminderPaymentStatus: Joi.object({
    payment_status: Joi.string().valid('pending', 'paid').required(),
  }),

  markInvoiceSent: Joi.object({
    invoice_number: Joi.string().trim().max(100).required(),
    invoice_date: Joi.string().trim().required(),
  }),

  extendReminder: Joi.object({
    due_date: Joi.string().trim().required(),
  }),
};
