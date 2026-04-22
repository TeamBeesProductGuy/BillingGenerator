const router = require('express').Router();
const billingController = require('../controllers/billing.controller');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { generateFromDb, decideRun } = require('../validators/billing.validator');

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
router.post('/runs/:id/decision', validate(decideRun), billingController.decideRun);
router.get('/runs/:id/download', billingController.downloadFile);
router.get('/runs/:id/download/:worksheet', billingController.downloadWorksheet);

module.exports = router;
