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

const decideRun = Joi.object({
  decision: Joi.string()
    .valid('Accepted', 'Rejected')
    .required(),

  poAssignments: Joi.array()
    .items(Joi.object({
      emp_code: Joi.string().trim().required(),
      po_id: Joi.number().integer().positive(),
      po_number: Joi.string().trim().min(1),
    }).or('po_id', 'po_number'))
    .default([]),

  approvedManagers: Joi.array()
    .items(Joi.string().trim().allow(''))
    .default([]),
});

module.exports = { generateFromDb, previewBilling, decideRun };
