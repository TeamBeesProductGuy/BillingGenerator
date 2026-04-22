const router = require('express').Router();
const poController = require('../controllers/purchaseOrder.controller');
const validate = require('../middleware/validate');
const { createPO, updatePO, recordConsumption, renewPO } = require('../validators/purchaseOrder.validator');

router.get('/alerts', poController.getAlerts);
router.get('/', poController.list);
router.get('/:id/employees', poController.getLinkedEmployees);
router.get('/:id', poController.getById);
router.post('/', validate(createPO), poController.create);
router.put('/:id', validate(updatePO), poController.update);
router.patch('/:id/consume', validate(recordConsumption), poController.recordConsumption);
router.patch('/:id/renew', validate(renewPO), poController.renew);

module.exports = router;
