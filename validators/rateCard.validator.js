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

  monthly_rate: Joi.number()
    .positive()
    .required(),

  leaves_allowed: Joi.number()
    .integer()
    .min(0)
    .default(0),

  charging_date: Joi.string()
    .allow('', null),

  po_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({ 'any.required': 'Purchase Order is required. A Rate Card must be assigned to a PO.' })
});

const updateRateCard = Joi.object({
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

  monthly_rate: Joi.number()
    .positive(),

  leaves_allowed: Joi.number()
    .integer()
    .min(0),

  charging_date: Joi.string()
    .allow('', null),

  po_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({ 'any.required': 'Purchase Order is required. A Rate Card must be assigned to a PO.' })
});

module.exports = { createRateCard, updateRateCard };
