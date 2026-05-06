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

const updateRunItem = Joi.object({
  leaves_taken: Joi.number().min(0).required(),
  days_present: Joi.number().min(0).required(),
  billing_hours: Joi.number().min(0).allow(null),
});

const createManagerDraft = Joi.object({
  manager_name: Joi.string().trim().min(1).required(),
  to: Joi.string().trim().min(1).required(),
  cc: Joi.string().trim().allow('').default(''),
});

module.exports = { generateFromDb, previewBilling, decideRun, updateRunItem, createManagerDraft };
