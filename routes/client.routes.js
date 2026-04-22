const router = require('express').Router();
const clientController = require('../controllers/client.controller');
const validate = require('../middleware/validate');
const { createClient, updateClient } = require('../validators/client.validator');

router.get('/', clientController.list);
router.get('/:id', clientController.getById);
router.post('/', validate(createClient), clientController.create);
router.put('/:id', validate(updateClient), clientController.update);
router.delete('/:id', clientController.remove);

module.exports = router;
