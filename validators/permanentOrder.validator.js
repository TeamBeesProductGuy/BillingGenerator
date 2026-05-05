const Joi = require('joi');

const personName = Joi.string()
  .trim()
  .pattern(/^[A-Za-z ]+$/)
  .messages({ 'string.pattern.base': 'Candidate name can contain only letters and spaces' });

const base = Joi.object({
  client_id: Joi.number().integer().positive().required(),
  candidate_name: personName.min(1).max(200).required(),
  requisition_description: Joi.string().trim().allow('', null),
  position_role: Joi.string().trim().min(1).max(200).required(),
  date_of_offer: Joi.string().trim().allow('', null),
  date_of_joining: Joi.string().trim().required(),
  ctc_offered: Joi.number().positive().required(),
  remarks: Joi.string().trim().allow('', null),
});

module.exports = {
  createPermanentOrder: base,
  updatePermanentOrder: base,
};
