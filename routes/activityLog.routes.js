const router = require('express').Router();
const controller = require('../controllers/activityLog.controller');

router.get('/', controller.list);

module.exports = router;
