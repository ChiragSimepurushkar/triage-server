const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { getNotifications, markRead, markAllRead } = require('../controllers/notification.controller');

router.use(protect); // All routes require auth

router.get('/', getNotifications);
router.patch('/mark-all-read', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
