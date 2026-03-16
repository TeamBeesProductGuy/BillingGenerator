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
    .default(0)
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
    .min(0)
});

module.exports = { createRateCard, updateRateCard };
