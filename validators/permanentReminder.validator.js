const Joi = require('joi');

module.exports = {
  updateReminderEmails: Joi.object({
    email_primary: Joi.string().email().allow('', null),
    email_secondary: Joi.string().email().allow('', null),
  }),

  extendReminder: Joi.object({
    due_date: Joi.string().trim().required(),
  }),
};
