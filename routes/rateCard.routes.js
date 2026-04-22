const router = require('express').Router();
const rateCardController = require('../controllers/rateCard.controller');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { createRateCard, updateRateCard, updateRateCardLeavesAllowed } = require('../validators/rateCard.validator');

router.get('/', rateCardController.list);
router.get('/export', rateCardController.exportExcel);
router.get('/:id', rateCardController.getById);
router.post('/', validate(createRateCard), rateCardController.create);
router.post('/upload', upload.single('file'), rateCardController.uploadExcel);
router.put('/:id', validate(updateRateCard), rateCardController.update);
router.patch('/:id/leaves-allowed', validate(updateRateCardLeavesAllowed), rateCardController.updateLeavesAllowed);
router.delete('/:id', rateCardController.remove);

module.exports = router;
