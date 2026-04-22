const router = require('express').Router();
const validate = require('../middleware/validate');
const controller = require('../controllers/permanentOrder.controller');
const { createPermanentOrder, updatePermanentOrder } = require('../validators/permanentOrder.validator');

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createPermanentOrder), controller.create);
router.put('/:id', validate(updatePermanentOrder), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
