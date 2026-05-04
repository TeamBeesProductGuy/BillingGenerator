const Joi = require('joi');

const createRateCard = Joi.object({
  client_id: Joi.number()
    .integer()
    .positive()
    .required(),

  emp_code: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .required(),

  emp_name: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .required(),

  doj: Joi.string()
    .allow('', null),

  reporting_manager: Joi.string()
    .trim()
    .max(200)
    .allow('', null),

  service_description: Joi.string()
    .trim()
    .max(500)
    .allow('', null),

  sow_item_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  monthly_rate: Joi.number()
    .min(0)
    .required(),

  leaves_allowed: Joi.number()
    .integer()
    .min(0)
    .default(0),

  charging_date: Joi.string()
    .allow('', null),

  sow_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({ 'any.required': 'SOW is required. A Rate Card must be linked to a SOW.' }),

  po_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  billing_active: Joi.boolean()
    .default(true),

  no_invoice: Joi.boolean()
    .default(false),

  pause_billing: Joi.boolean()
    .default(false),

  pause_start_date: Joi.string()
    .allow('', null),

  pause_end_date: Joi.string()
    .allow('', null),

  disable_billing: Joi.boolean()
    .default(false),

  disable_from_date: Joi.string()
    .allow('', null)
}).custom((value, helpers) => {
  if (value.doj && value.charging_date && String(value.doj) > String(value.charging_date)) {
    return helpers.message('Date of Joining must be less than or equal to Date of Reporting');
  }
  if (value.pause_billing && (!value.pause_start_date || !value.pause_end_date)) {
    return helpers.message('Pause billing requires from and to dates');
  }
  if (value.pause_start_date && value.pause_end_date && String(value.pause_start_date) > String(value.pause_end_date)) {
    return helpers.message('Pause billing from date must be less than or equal to to date');
  }
  if (value.disable_billing && !value.disable_from_date) {
    return helpers.message('Disable billing requires a from date');
  }
  return value;
});

const updateRateCard = Joi.object({
  client_id: Joi.number()
    .integer()
    .positive(),

  emp_code: Joi.string()
    .trim()
    .min(1)
    .max(50),

  emp_name: Joi.string()
    .trim()
    .min(1)
    .max(200),

  doj: Joi.string()
    .allow('', null),

  reporting_manager: Joi.string()
    .trim()
    .max(200)
    .allow('', null),

  service_description: Joi.string()
    .trim()
    .max(500)
    .allow('', null),

  sow_item_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  monthly_rate: Joi.number()
    .min(0),

  leaves_allowed: Joi.number()
    .integer()
    .min(0),

  charging_date: Joi.string()
    .allow('', null),

  sow_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({ 'any.required': 'SOW is required. A Rate Card must be linked to a SOW.' }),

  po_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  billing_active: Joi.boolean(),

  no_invoice: Joi.boolean()
    .default(false),

  pause_billing: Joi.boolean(),

  pause_start_date: Joi.string()
    .allow('', null),

  pause_end_date: Joi.string()
    .allow('', null),

  disable_billing: Joi.boolean(),

  disable_from_date: Joi.string()
    .allow('', null)
}).custom((value, helpers) => {
  if (value.doj && value.charging_date && String(value.doj) > String(value.charging_date)) {
    return helpers.message('Date of Joining must be less than or equal to Date of Reporting');
  }
  if (value.pause_billing && (!value.pause_start_date || !value.pause_end_date)) {
    return helpers.message('Pause billing requires from and to dates');
  }
  if (value.pause_start_date && value.pause_end_date && String(value.pause_start_date) > String(value.pause_end_date)) {
    return helpers.message('Pause billing from date must be less than or equal to to date');
  }
  if (value.disable_billing && !value.disable_from_date) {
    return helpers.message('Disable billing requires a from date');
  }
  return value;
});

const updateRateCardLeavesAllowed = Joi.object({
  leaves_allowed: Joi.number()
    .integer()
    .min(0)
    .required(),
});

module.exports = { createRateCard, updateRateCard, updateRateCardLeavesAllowed };
