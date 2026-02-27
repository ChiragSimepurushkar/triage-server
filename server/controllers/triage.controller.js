const TriageSession = require('../models/TriageSession.model');

// @desc    Create a new triage session
// @route   POST /api/triage
const createSession = async (req, res, next) => {
    try {
        const { chiefComplaint, symptoms, vitals, medicalHistory } = req.body;

        const session = await TriageSession.create({
            patientId: req.user._id,
            chiefComplaint,
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
                message: 'Triage session not found',
            });
        }

        // Patients can only view their own sessions
        if (
            req.user.role === 'patient' &&
            session.patientId._id.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this session',
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
                message: 'Triage session not found',
            });
        }

        // Only the patient who created it or a clinician can update
        if (
            req.user.role === 'patient' &&
            session.patientId.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this session',
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
