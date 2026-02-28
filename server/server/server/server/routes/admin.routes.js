const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser, getAuditLogs } = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// All admin routes require auth + admin role
router.use(protect);
router.use(authorize('admin'));

router.route('/users')
    .get(getUsers)
    .post(createUser);

router.route('/users/:id')
    .put(updateUser)
    .delete(deleteUser);

router.get('/logs', getAuditLogs);

module.exports = router;
