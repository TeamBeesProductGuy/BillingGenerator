const router = require('express').Router();
const attendanceController = require('../controllers/attendance.controller');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { submitSingle, submitBulk, deleteAttendance, deleteByMonth } = require('../validators/attendance.validator');

router.get('/', attendanceController.list);
router.get('/summary', attendanceController.getSummary);
router.post('/', validate(submitSingle), attendanceController.submitSingle);
router.post('/bulk', validate(submitBulk), attendanceController.submitBulk);
router.post('/upload', upload.single('file'), attendanceController.uploadExcel);
router.delete('/', validate(deleteAttendance), attendanceController.remove);
router.delete('/by-month', validate(deleteByMonth), attendanceController.deleteByMonth);

module.exports = router;
