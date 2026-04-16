const router = require('express').Router();
const validate = require('../middleware/validate');
const controller = require('../controllers/permanentReminder.controller');
const { updateReminderEmails, extendReminder } = require('../validators/permanentReminder.validator');

router.get('/', controller.listWindowedOpen);
router.patch('/:id/emails', validate(updateReminderEmails), controller.updateEmails);
router.patch('/:id/close', controller.close);
router.patch('/:id/extend', validate(extendReminder), controller.extend);

module.exports = router;
