const Joi = require('joi');

function dateRangeValidator(value, helpers) {
  if (value.start_date && value.end_date && String(value.start_date) > String(value.end_date)) {
    return helpers.message('Start date must be less than or equal to end date');
  }
  return value;
}

const createPO = Joi.object({
  po_number: Joi.string()
    .trim()
    .allow('', null),

  client_id: Joi.number()
    .integer()
    .positive()
    .required(),

  po_date: Joi.string()
    .required(),

  start_date: Joi.string()
    .required(),

  end_date: Joi.string()
    .required(),

  po_value: Joi.number()
    .positive()
    .required(),

  alert_threshold: Joi.number()
    .min(1)
    .max(100)
    .default(80),

  sow_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({ 'any.required': 'SOW is required. A Purchase Order must be linked to a Statement of Work.' }),

  sow_source_client_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  notes: Joi.string()
    .trim()
    .allow('', null)
}).custom(dateRangeValidator);

const updatePO = Joi.object({
  po_number: Joi.string()
    .trim()
    .allow('', null),

  client_id: Joi.number()
    .integer()
    .positive()
    .required(),

  po_date: Joi.string()
    .required(),

  start_date: Joi.string()
    .required(),

  end_date: Joi.string()
    .required(),

  po_value: Joi.number()
    .positive()
    .required(),

  alert_threshold: Joi.number()
    .min(1)
    .max(100)
    .default(80),

  sow_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({ 'any.required': 'SOW is required. A Purchase Order must be linked to a Statement of Work.' }),

  sow_source_client_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  notes: Joi.string()
    .trim()
    .allow('', null)
}).custom(dateRangeValidator);

const recordConsumption = Joi.object({
  amount: Joi.number()
    .positive()
    .required(),

  description: Joi.string()
    .trim()
    .allow('', null),

  billingRunId: Joi.number()
    .integer()
    .positive()
    .allow(null)
});

const renewPO = Joi.object({
  po_number: Joi.string()
    .trim()
    .min(1)
    .required(),

  po_date: Joi.string()
    .required(),

  start_date: Joi.string()
    .required(),

  end_date: Joi.string()
    .required(),

  po_value: Joi.number()
    .positive()
    .required(),

  alert_threshold: Joi.number()
    .min(1)
    .max(100)
    .default(80),

  notes: Joi.string()
    .trim()
    .allow('', null)
}).custom(dateRangeValidator);

const updatePOStatus = Joi.object({
  status: Joi.string()
    .valid('Active', 'Inactive', 'Expired', 'Exhausted', 'Renewed', 'Cancelled')
    .required(),
});

module.exports = { createPO, updatePO, recordConsumption, renewPO, updatePOStatus };
