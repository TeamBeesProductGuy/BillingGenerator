const router = require('express').Router();
const upload = require('../middleware/upload');
const { requireIntegrationKey } = require('../middleware/integrationAuth');
const attendanceController = require('../controllers/attendance.controller');

// Inbound service-to-service endpoints. Authenticated by the integration key
// (shared secret), NOT a user session — so this router is mounted OUTSIDE the
// authed /api router in app.js.
//
// POST /api/integrations/attendance/receive
//   multipart: file=<consolidated .xlsx>, billingMonth=YYYYMM, client=<name>
//   Used by the HR Ops (HR1) "Export to Billing Gen" button.
router.post(
  '/attendance/receive',
  requireIntegrationKey,
  upload.single('file'),
  attendanceController.importFromHr,
);

module.exports = router;
