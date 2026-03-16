const ClientModel = require('../models/client.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

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
    const { client_name, contact_person, email, phone, address } = req.body;
    try {
      const id = await ClientModel.create({ client_name, contact_person, email, phone, address });
      res.status(201).json({ success: true, data: { id, client_name } });
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))) {
        throw new AppError(409, 'Client name already exists');
      }
      throw err;
    }
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await ClientModel.findById(id);
    if (!existing) throw new AppError(404, 'Client not found');
    const { client_name, contact_person, email, phone, address } = req.body;
    await ClientModel.update(id, { client_name, contact_person, email, phone, address });
    res.json({ success: true, data: { id, client_name } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await ClientModel.findById(id);
    if (!existing) throw new AppError(404, 'Client not found');
    await ClientModel.softDelete(id);
    res.json({ success: true, data: { message: 'Client deleted' } });
  }),
};

module.exports = clientController;
