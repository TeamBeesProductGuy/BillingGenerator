const router = require('express').Router();
const profileController = require('../controllers/profile.controller');

router.get('/me', profileController.me);
router.patch('/me', profileController.requestUpdate);
router.post('/password', profileController.changePassword);

module.exports = router;
