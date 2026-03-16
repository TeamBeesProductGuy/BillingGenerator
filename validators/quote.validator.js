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

  tax_percent: Joi.number()
    .min(0)
    .max(100)
    .default(18),

  notes: Joi.string()
    .trim()
    .allow('', null),

  items: Joi.array()
    .items(quoteItem)
    .min(1)
    .required()
});

const updateQuote = createQuote;

const updateStatus = Joi.object({
  status: Joi.string()
    .valid('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired')
    .required()
});

module.exports = { createQuote, updateQuote, updateStatus };
