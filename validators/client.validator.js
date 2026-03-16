const Joi = require('joi');

const createClient = Joi.object({
  client_name: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .required(),

  contact_person: Joi.string()
    .trim()
    .max(200)
    .allow('', null),

  email: Joi.string()
    .email()
    .allow('', null),

  phone: Joi.string()
    .trim()
    .max(20)
    .allow('', null),

  address: Joi.string()
    .trim()
    .max(500)
    .allow('', null)
});

const updateClient = createClient; // same shape

module.exports = { createClient, updateClient };
