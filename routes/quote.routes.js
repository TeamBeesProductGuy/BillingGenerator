const router = require('express').Router();
const quoteController = require('../controllers/quote.controller');
const validate = require('../middleware/validate');
const { createQuote, updateQuote, updateStatus } = require('../validators/quote.validator');
const { convertToPO } = require('../validators/purchaseOrder.validator');

router.get('/', quoteController.list);
router.get('/:id', quoteController.getById);
router.post('/', validate(createQuote), quoteController.create);
router.put('/:id', validate(updateQuote), quoteController.update);
router.patch('/:id/status', validate(updateStatus), quoteController.updateStatus);
router.delete('/:id', quoteController.remove);
router.get('/:id/download', quoteController.download);
router.get('/:id/pdf', quoteController.downloadPDF);
router.post('/:id/convert-to-po', validate(convertToPO), quoteController.convertToPO);

module.exports = router;
