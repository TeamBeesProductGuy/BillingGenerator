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
    .required(),

  valid_from: Joi.string()
    .required(),

  valid_to: Joi.string()
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
}).custom((value, helpers) => {
  if (value.effective_start && value.effective_end && String(value.effective_start) > String(value.effective_end)) {
    return helpers.message('Start date must be less than or equal to end date');
  }
  const items = Array.isArray(value.items) ? value.items : [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.valid_from && item.valid_to && String(item.valid_from) > String(item.valid_to)) {
      return helpers.message(`Line item ${index + 1} duration start must be less than or equal to duration end`);
    }
    if (value.effective_start && item.valid_from && String(item.valid_from) < String(value.effective_start)) {
      return helpers.message(`Line item ${index + 1} duration cannot start before the SOW effective start`);
    }
    if (value.effective_end && item.valid_to && String(item.valid_to) > String(value.effective_end)) {
      return helpers.message(`Line item ${index + 1} duration cannot end after the SOW end date`);
    }
  }
  return value;
});

const updateSOW = createSOW;

const updateSOWStatus = Joi.object({
  status: Joi.string()
    .valid('Draft', 'Active', 'Signed', 'Expired', 'Terminated', 'Inactive', 'Amendment Draft')
    .required()
});

module.exports = { createSOW, updateSOW, updateSOWStatus };
