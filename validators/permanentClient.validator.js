const Joi = require('joi');

const contactSchema = Joi.object({
  contact_name: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().email().allow('', null),
  phone: Joi.string().trim().max(30).allow('', null),
  designation: Joi.string().trim().max(120).allow('', null),
});

const baseSchema = Joi.object({
  client_name: Joi.string().trim().min(1).max(200).required(),
  abbreviation: Joi.string().trim().max(50).allow('', null),
  address: Joi.string().trim().max(500).allow('', null),
  billing_address: Joi.string().trim().max(500).allow('', null),
  billing_pattern: Joi.string().valid('Weekly', 'Monthly', 'Quarterly').required(),
  billing_rate: Joi.number().positive().max(100).required(),
  contacts: Joi.array().items(contactSchema).min(1).required(),
});

module.exports = {
  createPermanentClient: baseSchema,
  updatePermanentClient: baseSchema,
};
