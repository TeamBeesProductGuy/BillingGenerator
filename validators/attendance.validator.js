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
    .valid('P', 'L', 'p', 'l')
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
      .integer()
      .min(0),
    Joi.array().items(
      Joi.number()
        .integer()
        .min(1)
        .max(31)
    )
  )
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
