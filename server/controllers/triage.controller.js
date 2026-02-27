const TriageSession = require('../models/TriageSession.model');

// @desc    Create a new triage session
// @route   POST /api/triage
const createSession = async (req, res, next) => {
    try {
        const { chiefComplaint, symptoms, vitals, medicalHistory } = req.body;

        // ── Validation ──
        const errors = [];
        if (!chiefComplaint || chiefComplaint.trim().length < 2) {
            errors.push('Chief complaint is required (at least 2 characters)');
        }
        if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
            errors.push('At least one symptom is required');
        } else {
            symptoms.forEach((s, i) => {
                if (!s.name) errors.push(`Symptom ${i + 1}: name is required`);
                if (s.severity !== undefined && (s.severity < 1 || s.severity > 10)) {
                    errors.push(`Symptom "${s.name || i + 1}": severity must be between 1 and 10`);
                }
            });
        }
        if (vitals) {
            if (vitals.bloodPressureSystolic !== undefined && (vitals.bloodPressureSystolic < 50 || vitals.bloodPressureSystolic > 300)) {
                errors.push('BP Systolic must be between 50 and 300 mmHg');
            }
            if (vitals.bloodPressureDiastolic !== undefined && (vitals.bloodPressureDiastolic < 20 || vitals.bloodPressureDiastolic > 200)) {
                errors.push('BP Diastolic must be between 20 and 200 mmHg');
            }
            if (vitals.heartRate !== undefined && (vitals.heartRate < 20 || vitals.heartRate > 250)) {
                errors.push('Heart rate must be between 20 and 250 bpm');
            }
            if (vitals.temperature !== undefined && (vitals.temperature < 30 || vitals.temperature > 45)) {
                errors.push('Temperature must be between 30°C and 45°C');
            }
            if (vitals.oxygenSaturation !== undefined && (vitals.oxygenSaturation < 0 || vitals.oxygenSaturation > 100)) {
                errors.push('Oxygen saturation must be between 0% and 100%');
            }
        }
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        const session = await TriageSession.create({
            patientId: req.user._id,
            chiefComplaint: chiefComplaint.trim(),
            symptoms,
            vitals,
            medicalHistory,
            status: 'pending',
        });

        res.status(201).json({
            success: true,
            message: 'Triage session created successfully',
            data: { session },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a triage session by ID
// @route   GET /api/triage/:id
const getSessionById = async (req, res, next) => {
    try {
        const session = await TriageSession.findById(req.params.id)
            .populate('patientId', 'name email')
            .populate('clinicianOverride.clinicianId', 'name email')
            .populate('assignedClinician', 'name email');

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found. It may have been deleted.',
            });
        }

        if (
            req.user.role === 'patient' &&
            session.patientId._id.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'You can only view your own triage sessions.',
            });
        }

        res.json({
            success: true,
            data: { session },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all sessions for current patient
// @route   GET /api/triage/my-sessions
const getPatientSessions = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const sessions = await TriageSession.find({ patientId: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await TriageSession.countDocuments({ patientId: req.user._id });

        res.json({
            success: true,
            data: {
                sessions,
                pagination: {
                    current: page,
                    pages: Math.ceil(total / limit),
                    total,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a triage session
// @route   PUT /api/triage/:id
const updateSession = async (req, res, next) => {
    try {
        const session = await TriageSession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found.',
            });
        }

        if (
            req.user.role === 'patient' &&
            session.patientId.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'You can only update your own triage sessions.',
            });
        }

        const { chiefComplaint, symptoms, vitals, medicalHistory, status } = req.body;

        if (chiefComplaint) session.chiefComplaint = chiefComplaint;
        if (symptoms) session.symptoms = symptoms;
        if (vitals) session.vitals = vitals;
        if (medicalHistory) session.medicalHistory = medicalHistory;
        if (status) session.status = status;

        await session.save();

        res.json({
            success: true,
            message: 'Session updated successfully',
            data: { session },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createSession, getSessionById, getPatientSessions, updateSession };
