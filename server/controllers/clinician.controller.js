const TriageSession = require('../models/TriageSession.model');
const { createNotification } = require('./notification.controller');

// @desc    Get triage queue (sorted by urgency — CRITICAL first)
// @route   GET /api/clinician/queue
const getTriageQueue = async (req, res, next) => {
    try {
        const { status, urgency } = req.query;
        const filter = {};

        if (status) {
            filter.status = status;
        } else {
            filter.status = { $in: ['pending', 'ai_processing', 'awaiting_review'] };
        }

        if (urgency) {
            const u = parseInt(urgency);
            if (isNaN(u) || u < 1 || u > 5) {
                return res.status(400).json({ success: false, message: 'Urgency filter must be a number between 1 (Critical) and 5 (Observation)' });
            }
            filter['aiRecommendation.urgency_level'] = u;
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
                message: 'Triage session not found.',
            });
        }

        session.status = 'reviewed';
        session.assignedClinician = req.user._id;
        await session.save();

        // Notify the patient
        await createNotification(
            session.patientId,
            'Session Reviewed',
            `Your triage session has been reviewed by Dr. ${req.user.name}.`,
            'success',
            `/triage/session/${session._id}`
        );

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

        // ── Validation ──
        const errors = [];
        if (!finalUrgency && finalUrgency !== 0) {
            errors.push('Final urgency level is required (1 = Critical, 5 = Observation)');
        } else if (finalUrgency < 1 || finalUrgency > 5) {
            errors.push('Final urgency must be between 1 (Critical) and 5 (Observation)');
        }
        if (!finalUrgencyLabel || finalUrgencyLabel.trim().length === 0) {
            errors.push('Urgency label is required (e.g. CRITICAL, HIGH, MODERATE, LOW, OBSERVATION)');
        }
        if (!notes || notes.trim().length < 5) {
            errors.push('Clinical notes are required (at least 5 characters to be meaningful)');
        }
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        const session = await TriageSession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found.',
            });
        }

        session.clinicianOverride = {
            clinicianId: req.user._id,
            notes: notes.trim(),
            finalUrgency,
            finalUrgencyLabel: finalUrgencyLabel.trim().toUpperCase(),
            timestamp: new Date(),
        };
        session.status = 'reviewed';
        session.assignedClinician = req.user._id;
        await session.save();

        // Notify the patient about the override
        await createNotification(
            session.patientId,
            'Urgency Updated',
            `Dr. ${req.user.name} reviewed your session and set urgency to ${finalUrgencyLabel.trim().toUpperCase()}.`,
            finalUrgency <= 2 ? 'error' : 'info',
            `/triage/session/${session._id}`
        );

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
                message: 'Triage session not found.',
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
