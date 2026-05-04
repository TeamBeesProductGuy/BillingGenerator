const PermanentClientModel = require('../models/permanentClient.model');
const PermanentOrderModel = require('../models/permanentOrder.model');
const PermanentReminderModel = require('../models/permanentReminder.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');
const { calculateBillAmount, calculateNextBillDate } = require('../services/permanentBilling.service');
const { logActivity } = require('../services/activityLog.service');

function buildComputedOrderFields(payload, client) {
  const billAmount = calculateBillAmount(payload.ctc_offered, client.billing_rate);
  const nextBillDate = calculateNextBillDate(payload.date_of_joining, client.billing_pattern);

  return {
    ...payload,
    bill_amount: billAmount,
    next_bill_date: nextBillDate,
  };
}

const permanentOrderController = {
  list: catchAsync(async (req, res) => {
    const orders = await PermanentOrderModel.findAll();
    res.json({ success: true, data: orders });
  }),

  getById: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const order = await PermanentOrderModel.findById(id);
    if (!order) throw new AppError(404, 'Order not found');
    res.json({ success: true, data: order });
  }),

  create: catchAsync(async (req, res) => {
    const client = await PermanentClientModel.findById(req.body.client_id);
    if (!client || !client.is_active) throw new AppError(404, 'Permanent client not found');

    const payload = buildComputedOrderFields(req.body, client);
    const orderId = await PermanentOrderModel.create(payload);
    await PermanentReminderModel.createForOrder(orderId, payload.next_bill_date);

    const order = await PermanentOrderModel.findById(orderId);
    await logActivity(req, {
      module: 'permanent_orders',
      action: 'create',
      entityType: 'permanent_order',
      entityId: orderId,
      entityLabel: (payload.candidate_name || '') + ' - ' + (payload.position_role || ''),
      details: { summary: 'Created permanent order for ' + payload.candidate_name },
    });
    res.status(201).json({ success: true, data: order });
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentOrderModel.findById(id);
    if (!existing) throw new AppError(404, 'Order not found');

    const client = await PermanentClientModel.findById(req.body.client_id);
    if (!client || !client.is_active) throw new AppError(404, 'Permanent client not found');

    const payload = buildComputedOrderFields(req.body, client);
    await PermanentOrderModel.update(id, payload);

    const reminder = await PermanentReminderModel.findOpenByOrderId(id);
    if (reminder && reminder.status === 'Open') {
      await PermanentReminderModel.extend(reminder.id, payload.next_bill_date);
    }

    const order = await PermanentOrderModel.findById(id);
    await logActivity(req, {
      module: 'permanent_orders',
      action: 'update',
      entityType: 'permanent_order',
      entityId: id,
      entityLabel: (payload.candidate_name || '') + ' - ' + (payload.position_role || ''),
      details: { summary: 'Updated permanent order for ' + payload.candidate_name },
    });
    res.json({ success: true, data: order });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await PermanentOrderModel.findById(id);
    if (!existing) throw new AppError(404, 'Order not found');

    await PermanentOrderModel.remove(id);
    await logActivity(req, {
      module: 'permanent_orders',
      action: 'delete',
      entityType: 'permanent_order',
      entityId: id,
      entityLabel: (existing.candidate_name || '') + ' - ' + (existing.position_role || ''),
      details: { summary: 'Deleted permanent order for ' + existing.candidate_name },
    });
    res.json({ success: true, data: { message: 'Order deleted' } });
  }),
};

module.exports = permanentOrderController;
