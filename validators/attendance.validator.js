const Joi = require('joi');

const submitSingle = Joi.object({
  emp_code: Joi.string()
    .trim()
    .required(),

  emp_name: Joi.string()
    .trim()
    .allow('', null),

  reporting_manager: Joi.string()
    .trim()
    .allow('', null),

  billing_month: Joi.string()
    .pattern(/^\d{6}$/)
    .required(),

  day_number: Joi.number()
    .integer()
    .min(1)
    .max(31)
    .required(),

  status: Joi.string()
    .valid('P', 'L', 'WO', 'p', 'l', 'wo')
    .required()
});

const submitBulk = Joi.object({
  emp_code: Joi.string()
    .trim()
    .required(),

  emp_name: Joi.string()
    .trim()
    .allow('', null),

  reporting_manager: Joi.string()
    .trim()
    .allow('', null),

  billing_month: Joi.string()
    .pattern(/^\d{6}$/)
    .required(),

  leaves: Joi.alternatives().try(
    Joi.number()
      .min(0)
      .precision(1)
      .multiple(0.5),
    Joi.array().items(
      Joi.number()
        .integer()
        .min(1)
        .max(31)
    )
  ),

  leave_entries: Joi.array().items(
    Joi.object({
      day_number: Joi.number()
        .integer()
        .min(1)
        .max(31)
        .required(),
      leave_units: Joi.number()
        .valid(0.5, 1)
        .required(),
    })
  ).optional()
});

const deleteAttendance = Joi.object({
  empCode: Joi.string()
    .trim()
    .required(),

  billingMonth: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
});

const deleteByMonth = Joi.object({
  billingMonth: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
});

module.exports = { submitSingle, submitBulk, deleteAttendance, deleteByMonth };
