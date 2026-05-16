const router = require('express').Router();
const adminController = require('../controllers/admin.controller');

router.get('/stats', adminController.stats);
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.delete('/users/:id', adminController.deleteUser);
router.get('/approvals', adminController.listApprovals);
router.get('/approvals/mine', adminController.myApprovals);
router.post('/approvals/:id/approve', adminController.approve);
router.post('/approvals/:id/reject', adminController.reject);

module.exports = router;
