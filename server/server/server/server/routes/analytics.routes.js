const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    getUrgencyDistribution,
    getRecentActivity,
} = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

router.get('/stats', protect, requireRole('clinician', 'admin'), getDashboardStats);
router.get('/urgency-distribution', protect, requireRole('clinician', 'admin'), getUrgencyDistribution);
router.get('/recent', protect, requireRole('clinician', 'admin'), getRecentActivity);

module.exports = router;
