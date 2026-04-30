const Joi = require('joi');

const PHONE_RULES = {
  '+91': { min: 10, max: 10 },
  '+1': { min: 10, max: 10 },
  '+44': { min: 10, max: 10 },
  '+61': { min: 9, max: 9 },
  '+65': { min: 8, max: 8 },
  '+971': { min: 9, max: 9 },
};

function validatePhoneByCountry(value, helpers) {
  const raw = String(value || '').trim();
  if (!raw) return value;
  const matchedCode = Object.keys(PHONE_RULES).find((code) => raw.startsWith(code));
  if (!matchedCode) {
    return helpers.error('any.invalid');
  }
  const digits = raw.slice(matchedCode.length).replace(/\D/g, '');
  const rule = PHONE_RULES[matchedCode];
  if (digits.length < rule.min || digits.length > rule.max) {
    return helpers.error('string.pattern.base');
  }
  return `${matchedCode}${digits}`;
}

const createClient = Joi.object({
  client_name: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .required(),

  abbreviation: Joi.string()
    .trim()
    .max(50)
    .allow('', null),

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
    .custom(validatePhoneByCountry)
    .messages({
      'any.invalid': 'Phone must start with a supported country code (for example +91, +1, +44).',
      'string.pattern.base': 'Phone number length is invalid for the selected country code.',
    })
    .allow('', null),

  address: Joi.string()
    .trim()
    .max(500)
    .allow('', null),

  industry: Joi.string()
    .trim()
    .max(200)
    .allow('', null),

  leaves_allowed: Joi.number()
    .integer()
    .min(0)
    .default(0)
});

const updateClient = createClient; // same shape

module.exports = { createClient, updateClient };
