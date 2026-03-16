const router = require('express').Router();

router.use('/billing', require('./billing.routes'));
router.use('/clients', require('./client.routes'));
router.use('/rate-cards', require('./rateCard.routes'));
router.use('/attendance', require('./attendance.routes'));
router.use('/quotes', require('./quote.routes'));
router.use('/purchase-orders', require('./purchaseOrder.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/samples', require('./samples.routes'));

module.exports = router;
