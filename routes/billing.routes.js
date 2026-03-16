const router = require('express').Router();
const billingController = require('../controllers/billing.controller');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { generateFromDb } = require('../validators/billing.validator');

router.post(
  '/generate',
  upload.fields([
    { name: 'rateCardFile', maxCount: 1 },
    { name: 'attendanceFile', maxCount: 1 },
  ]),
  billingController.generateFromFiles
);

router.post('/generate-from-db', validate(generateFromDb), billingController.generateFromDb);
router.get('/runs', billingController.listRuns);
router.get('/runs/:id', billingController.getRunDetails);
router.get('/runs/:id/download', billingController.downloadFile);

module.exports = router;
