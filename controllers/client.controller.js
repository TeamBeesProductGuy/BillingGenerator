const ClientModel = require('../models/client.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');
const { logActivity } = require('../services/activityLog.service');

const clientController = {
  list: catchAsync(async (req, res) => {
    const clients = await ClientModel.findAll();
    res.json({ success: true, data: clients });
  }),

  getById: catchAsync(async (req, res) => {
    const client = await ClientModel.findById(parseInt(req.params.id, 10));
    if (!client) throw new AppError(404, 'Client not found');
    res.json({ success: true, data: client });
  }),

  create: catchAsync(async (req, res) => {
    const { client_name, abbreviation, contact_person, email, phone, address, industry, leaves_allowed } = req.body;
    const duplicate = await ClientModel.findByNameAndAddress(client_name, address);
    if (duplicate) {
      throw new AppError(409, 'Client with the same name and location already exists');
    }
    try {
      const id = await ClientModel.create({ client_name, abbreviation, contact_person, email, phone, address, industry, leaves_allowed });
      await logActivity(req, {
        module: 'clients',
        action: 'create',
        entityType: 'client',
        entityId: id,
        entityLabel: client_name,
        details: { summary: 'Created client ' + client_name },
      });
      res.status(201).json({ success: true, data: { id, client_name, abbreviation } });
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))) {
        throw new AppError(409, 'Client with the same name and location already exists');
      }
      throw err;
    }
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await ClientModel.findById(id);
    if (!existing) throw new AppError(404, 'Client not found');
    const { client_name, abbreviation, contact_person, email, phone, address, industry, leaves_allowed } = req.body;
    const duplicate = await ClientModel.findByNameAndAddress(client_name, address, id);
    if (duplicate) {
      throw new AppError(409, 'Client with the same name and location already exists');
    }
    await ClientModel.update(id, { client_name, abbreviation, contact_person, email, phone, address, industry, leaves_allowed });
    await logActivity(req, {
      module: 'clients',
      action: 'update',
      entityType: 'client',
      entityId: id,
      entityLabel: client_name,
      details: { summary: 'Updated client ' + client_name },
    });
    res.json({ success: true, data: { id, client_name, abbreviation } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await ClientModel.findById(id);
    if (!existing) throw new AppError(404, 'Client not found');
    await ClientModel.softDelete(id);
    await logActivity(req, {
      module: 'clients',
      action: 'delete',
      entityType: 'client',
      entityId: id,
      entityLabel: existing.client_name,
      details: { summary: 'Deleted client ' + existing.client_name },
    });
    res.json({ success: true, data: { message: 'Client deleted' } });
  }),
};

module.exports = clientController;
