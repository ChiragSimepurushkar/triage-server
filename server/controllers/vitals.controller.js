const Vitals = require('../models/Vitals.model');
const TriageSession = require('../models/TriageSession.model');

// @desc    Add vitals to a session
// @route   POST /api/triage/:sessionId/vitals
const addVitals = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { bp_systolic, bp_diastolic, heart_rate, spo2, temperature, respiratory_rate, notes } =
            req.body;

        // Verify session exists
        const session = await TriageSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found',
            });
        }

        // Create standalone vitals record
        const vitals = await Vitals.create({
            sessionId,
            patientId: session.patientId,
            bp_systolic,
            bp_diastolic,
            heart_rate,
            spo2,
            temperature,
            respiratory_rate,
            notes,
        });

        // Update session vitals as well
        session.vitals = {
            bp_systolic,
            bp_diastolic,
            heart_rate,
            spo2,
            temperature,
            respiratory_rate,
        };
        await session.save();

        res.status(201).json({
            success: true,
            message: 'Vitals recorded successfully',
            data: { vitals },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get vitals for a session
// @route   GET /api/triage/:sessionId/vitals
const getVitalsBySession = async (req, res, next) => {
    try {
        const vitals = await Vitals.find({ sessionId: req.params.sessionId }).sort({
            recordedAt: -1,
        });

        res.json({
            success: true,
            data: { vitals },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { addVitals, getVitalsBySession };
