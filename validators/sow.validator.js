const Joi = require('joi');

const sowItem = Joi.object({
  role_position: Joi.string()
    .trim()
    .min(1)
    .required(),

  quantity: Joi.number()
    .integer()
    .min(1)
    .required(),

  amount: Joi.number()
    .min(0)
    .required()
});

const createSOW = Joi.object({
  sow_number: Joi.string()
    .trim()
    .min(1)
    .required(),

  client_id: Joi.number()
    .integer()
    .positive()
    .required(),

  quote_id: Joi.number()
    .integer()
    .positive()
    .allow(null),

  sow_date: Joi.string()
    .required(),

  effective_start: Joi.string()
    .required(),

  effective_end: Joi.string()
    .required(),

  notes: Joi.string()
    .trim()
    .allow('', null),

  items: Joi.array()
    .items(sowItem)
    .min(1)
    .required()
});

const updateSOW = createSOW;

const updateSOWStatus = Joi.object({
  status: Joi.string()
    .valid('Draft', 'Active', 'Signed', 'Expired', 'Terminated', 'Amendment Draft')
    .required()
});

module.exports = { createSOW, updateSOW, updateSOWStatus };
