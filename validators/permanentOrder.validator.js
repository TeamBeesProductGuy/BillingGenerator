const Joi = require('joi');

const base = Joi.object({
  client_id: Joi.number().integer().positive().required(),
  candidate_name: Joi.string().trim().min(1).max(200).required(),
  position_role: Joi.string().trim().min(1).max(200).required(),
  date_of_joining: Joi.string().trim().required(),
  ctc_offered: Joi.number().positive().required(),
  remarks: Joi.string().trim().allow('', null),
});

module.exports = {
  createPermanentOrder: base,
  updatePermanentOrder: base,
};
