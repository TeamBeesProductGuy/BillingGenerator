const router = require('express').Router();
const validate = require('../middleware/validate');
const controller = require('../controllers/permanentClient.controller');
const { createPermanentClient, updatePermanentClient } = require('../validators/permanentClient.validator');

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createPermanentClient), controller.create);
router.put('/:id', validate(updatePermanentClient), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
