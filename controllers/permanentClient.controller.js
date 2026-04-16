const PermanentClientModel = require('../models/permanentClient.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const permanentClientController = {
  list: catchAsync(async (req, res) => {
    const clients = await PermanentClientModel.findAll();
    res.json({ success: true, data: clients });
  }),

  getById: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const client = await PermanentClientModel.findById(id);
    if (!client) throw new AppError(404, 'Permanent client not found');
    res.json({ success: true, data: client });
  }),

  create: catchAsync(async (req, res) => {
    const duplicate = await PermanentClientModel.findByNameAndAddress(req.body.client_name, req.body.address);
    if (duplicate) {
      throw new AppError(409, 'Permanent client with the same name and location already exists');
    }

    const id = await PermanentClientModel.create(req.body);
    res.status(201).json({ success: true, data: { id } });
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentClientModel.findById(id);
    if (!existing) throw new AppError(404, 'Permanent client not found');

    const duplicate = await PermanentClientModel.findByNameAndAddress(req.body.client_name, req.body.address, id);
    if (duplicate) {
      throw new AppError(409, 'Permanent client with the same name and location already exists');
    }

    await PermanentClientModel.update(id, req.body);
    res.json({ success: true, data: { id } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentClientModel.findById(id);
    if (!existing) throw new AppError(404, 'Permanent client not found');
    await PermanentClientModel.softDelete(id);
    res.json({ success: true, data: { message: 'Permanent client deleted' } });
  }),
};

module.exports = permanentClientController;
