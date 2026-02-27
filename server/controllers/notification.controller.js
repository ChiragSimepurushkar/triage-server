const Notification = require('../models/Notification.model');

// Helper — create a notification (called from other controllers)
const createNotification = async (userId, title, message, type = 'info', link = '') => {
    try {
        await Notification.create({ userId, title, message, type, link });
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
};

// @desc    Get notifications for authenticated user
// @route   GET /api/notifications
const getNotifications = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Notification.countDocuments({ userId: req.user._id });
        const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });

        res.json({
            success: true,
            data: { notifications, unreadCount, total, page, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Mark a notification as read
// @route   PATCH /api/notifications/:id/read
const markRead = async (req, res, next) => {
    try {
        const notif = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { read: true },
            { new: true }
        );
        if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, data: notif });
    } catch (error) {
        next(error);
    }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-all-read
const markAllRead = async (req, res, next) => {
    try {
        await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        next(error);
    }
};

module.exports = { createNotification, getNotifications, markRead, markAllRead };
