const Joi = require('joi');

const quoteItem = Joi.object({
  description: Joi.string()
    .trim()
    .min(1)
    .required(),

  quantity: Joi.number()
    .integer()
    .min(1)
    .required(),

  unit_rate: Joi.number()
    .min(0)
    .required(),

  amount: Joi.number()
    .min(0)
    .required(),

  emp_code: Joi.string()
    .trim()
    .allow('', null),

  location: Joi.string()
    .trim()
    .max(200)
    .allow('', null)
});

const createQuote = Joi.object({
  client_id: Joi.number()
    .integer()
    .positive()
    .required(),

  quote_date: Joi.string()
    .required(),

  valid_until: Joi.string()
    .required(),

  notes: Joi.string()
    .trim()
    .allow('', null),

  items: Joi.array()
    .items(quoteItem)
    .min(1)
    .required()
}).custom((value, helpers) => {
  if (value.quote_date && value.valid_until && String(value.quote_date) > String(value.valid_until)) {
    return helpers.message('Quote date must be less than or equal to valid until date');
  }
  return value;
});

const updateQuote = createQuote;

const updateStatus = Joi.object({
  status: Joi.string()
    .valid('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired')
    .required()
});

const convertToSOW = Joi.object({
  mode: Joi.string()
    .valid('existing', 'new')
    .required(),

  sow_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  sow_number: Joi.string()
    .trim()
    .allow('', null),

  sow_date: Joi.string()
    .allow('', null),

  effective_start: Joi.string()
    .allow('', null),

  effective_end: Joi.string()
    .allow('', null),

  notes: Joi.string()
    .trim()
    .allow('', null)
});

module.exports = { createQuote, updateQuote, updateStatus, convertToSOW };
