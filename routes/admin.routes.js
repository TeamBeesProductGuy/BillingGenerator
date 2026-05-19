const router = require('express').Router();
const adminController = require('../controllers/admin.controller');

router.get('/stats', adminController.stats);
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.get('/clients', adminController.listClients);
router.put('/users/:id/permissions', adminController.updateUserPermissions);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.get('/permissions/me', adminController.myPermissions);
router.get('/approvals', adminController.listApprovals);
router.get('/approvals/counts', adminController.approvalCounts);
router.get('/approvals/mine', adminController.myApprovals);
router.post('/approvals/:id/approve', adminController.approve);
router.post('/approvals/:id/reject', adminController.reject);

module.exports = router;
