const Joi = require('joi');

const generateFromDb = Joi.object({
  clientId: Joi.number()
    .integer()
    .positive()
    .allow(null),

  billingMonth: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
});

const previewBilling = generateFromDb;

module.exports = { generateFromDb, previewBilling };
