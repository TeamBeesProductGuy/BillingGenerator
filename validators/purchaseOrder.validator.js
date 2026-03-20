const Joi = require('joi');

const createPO = Joi.object({
  po_number: Joi.string()
    .trim()
    .min(1)
    .required(),

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

  notes: Joi.string()
    .trim()
    .allow('', null)
});

const updatePO = createPO;

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
});

module.exports = { createPO, updatePO, recordConsumption, renewPO };
