const router = require('express').Router();
const validate = require('../middleware/validate');
const controller = require('../controllers/permanentReminder.controller');
const { updateReminderEmails, updateReminderPaymentStatus, markInvoiceSent, extendReminder } = require('../validators/permanentReminder.validator');

router.get('/', controller.listOpen);
router.patch('/:id/emails', validate(updateReminderEmails), controller.updateEmails);
router.patch('/:id/payment-status', validate(updateReminderPaymentStatus), controller.updatePaymentStatus);
router.patch('/:id/invoice-sent', validate(markInvoiceSent), controller.markInvoiceSent);
router.post('/:id/send-mail', controller.sendMail);
router.patch('/:id/close', controller.close);
router.patch('/:id/extend', validate(extendReminder), controller.extend);

module.exports = router;
