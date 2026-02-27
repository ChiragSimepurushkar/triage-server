const TriageSession = require('../models/TriageSession.model');

// @desc    Get dashboard statistics
// @route   GET /api/analytics/stats
const getDashboardStats = async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalSessions, todaySessions, pendingSessions, criticalSessions] =
            await Promise.all([
                TriageSession.countDocuments(),
                TriageSession.countDocuments({ createdAt: { $gte: today } }),
                TriageSession.countDocuments({
                    status: { $in: ['pending', 'ai_processing', 'awaiting_review'] },
                }),
                TriageSession.countDocuments({ 'aiRecommendation.urgency_level': 1 }),
            ]);

        res.json({
            success: true,
            data: {
                totalSessions,
                todaySessions,
                pendingSessions,
                criticalSessions,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get urgency distribution
// @route   GET /api/analytics/urgency-distribution
const getUrgencyDistribution = async (req, res, next) => {
    try {
        const distribution = await TriageSession.aggregate([
            {
                $match: {
                    'aiRecommendation.urgency_level': { $exists: true },
                },
            },
            {
                $group: {
                    _id: '$aiRecommendation.urgency_label',
                    count: { $sum: 1 },
                    urgencyLevel: { $first: '$aiRecommendation.urgency_level' },
                },
            },
            { $sort: { urgencyLevel: 1 } },
        ]);

        res.json({
            success: true,
            data: { distribution },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get recent triage activity
// @route   GET /api/analytics/recent
const getRecentActivity = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const recentSessions = await TriageSession.find()
            .populate('patientId', 'name')
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('chiefComplaint status aiRecommendation.urgency_label aiRecommendation.urgency_level createdAt');

        res.json({
            success: true,
            data: { recentSessions },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getDashboardStats, getUrgencyDistribution, getRecentActivity };
