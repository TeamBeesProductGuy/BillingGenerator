const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

// Apply auth middleware to all API routes
router.use(requireAuth);

router.use('/billing', require('./billing.routes'));
router.use('/clients', require('./client.routes'));
router.use('/rate-cards', require('./rateCard.routes'));
router.use('/attendance', require('./attendance.routes'));
router.use('/quotes', require('./quote.routes'));
router.use('/sows', require('./sow.routes'));
router.use('/purchase-orders', require('./purchaseOrder.routes'));
router.use('/permanent/clients', require('./permanentClient.routes'));
router.use('/permanent/orders', require('./permanentOrder.routes'));
router.use('/permanent/reminders', require('./permanentReminder.routes'));
router.use('/clients/permanent', require('./permanentClient.routes'));
router.use('/orders/permanent', require('./permanentOrder.routes'));
router.use('/reminders/permanent', require('./permanentReminder.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/samples', require('./samples.routes'));

module.exports = router;
