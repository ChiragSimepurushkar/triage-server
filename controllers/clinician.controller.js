const TriageSession = require('../models/TriageSession.model');

// @desc    Get triage queue (sorted by urgency — CRITICAL first)
// @route   GET /api/clinician/queue
const getTriageQueue = async (req, res, next) => {
    try {
        const { status, urgency } = req.query;
        const filter = {};

        if (status) {
            filter.status = status;
        } else {
            // Default: show pending and awaiting_review sessions
            filter.status = { $in: ['pending', 'ai_processing', 'awaiting_review'] };
        }

        if (urgency) {
            filter['aiRecommendation.urgency_level'] = parseInt(urgency);
        }

        const sessions = await TriageSession.find(filter)
            .populate('patientId', 'name email phone')
            .sort({ 'aiRecommendation.urgency_level': 1, createdAt: -1 });

        res.json({
            success: true,
            data: {
                count: sessions.length,
                sessions,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Review a triage session (mark as reviewed)
// @route   PUT /api/clinician/review/:id
const reviewSession = async (req, res, next) => {
    try {
        const session = await TriageSession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found',
            });
        }

        session.status = 'reviewed';
        session.assignedClinician = req.user._id;
        await session.save();

        res.json({
            success: true,
            message: 'Session marked as reviewed',
            data: { session },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Add clinician override to a session
// @route   PUT /api/clinician/override/:id
const addOverride = async (req, res, next) => {
    try {
        const { notes, finalUrgency, finalUrgencyLabel } = req.body;

        const session = await TriageSession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found',
            });
        }

        session.clinicianOverride = {
            clinicianId: req.user._id,
            notes,
            finalUrgency,
            finalUrgencyLabel,
            timestamp: new Date(),
        };
        session.status = 'reviewed';
        session.assignedClinician = req.user._id;
        await session.save();

        res.json({
            success: true,
            message: 'Clinician override added',
            data: { session },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Close a triage session
// @route   PUT /api/clinician/close/:id
const closeSession = async (req, res, next) => {
    try {
        const session = await TriageSession.findByIdAndUpdate(
            req.params.id,
            { status: 'closed' },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found',
            });
        }

        res.json({
            success: true,
            message: 'Session closed',
            data: { session },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getTriageQueue, reviewSession, addOverride, closeSession };
