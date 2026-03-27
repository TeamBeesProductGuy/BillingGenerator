const router = require('express').Router();
const sowController = require('../controllers/sow.controller');
const validate = require('../middleware/validate');
const { createSOW, updateSOW, updateSOWStatus } = require('../validators/sow.validator');

router.get('/', sowController.list);
router.get('/:id', sowController.getById);
router.post('/', validate(createSOW), sowController.create);
router.post('/:id/amend', validate(updateSOW), sowController.amend);
router.put('/:id', validate(updateSOW), sowController.update);
router.patch('/:id/status', validate(updateSOWStatus), sowController.updateStatus);
router.delete('/:id', sowController.remove);

module.exports = router;
