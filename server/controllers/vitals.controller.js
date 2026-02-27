const Vitals = require('../models/Vitals.model');
const TriageSession = require('../models/TriageSession.model');

// @desc    Add vitals to a session
// @route   POST /api/triage/:sessionId/vitals
const addVitals = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { bp_systolic, bp_diastolic, heart_rate, spo2, temperature, respiratory_rate, notes } =
            req.body;

        // ── Validation ──
        const errors = [];
        if (bp_systolic !== undefined && (bp_systolic < 50 || bp_systolic > 300)) {
            errors.push('BP Systolic must be between 50 and 300 mmHg');
        }
        if (bp_diastolic !== undefined && (bp_diastolic < 20 || bp_diastolic > 200)) {
            errors.push('BP Diastolic must be between 20 and 200 mmHg');
        }
        if (heart_rate !== undefined && (heart_rate < 20 || heart_rate > 250)) {
            errors.push('Heart rate must be between 20 and 250 bpm');
        }
        if (spo2 !== undefined && (spo2 < 0 || spo2 > 100)) {
            errors.push('SpO₂ must be between 0% and 100%');
        }
        if (temperature !== undefined && (temperature < 30 || temperature > 45)) {
            errors.push('Temperature must be between 30°C and 45°C');
        }
        if (respiratory_rate !== undefined && (respiratory_rate < 5 || respiratory_rate > 60)) {
            errors.push('Respiratory rate must be between 5 and 60 breaths/min');
        }
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        // Verify session exists
        const session = await TriageSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found.',
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
