const TriageSession = require('../models/TriageSession.model');
const AIRecommendation = require('../models/AIRecommendation.model');
const Patient = require('../models/Patient.model');
const { lookupClinicalContext, buildTriagePrompt } = require('../services/triageEngine.service');
const { generateTriageResponse } = require('../services/gemini.service');
const { sendCriticalAlert } = require('../services/email.service');

// @desc    Analyze a triage session with AI
// @route   POST /api/ai/analyze/:sessionId
const analyzeSession = async (req, res, next) => {
    try {
        const session = await TriageSession.findById(req.params.sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found',
            });
        }

        // Update status to processing
        session.status = 'ai_processing';
        await session.save();

        // Get patient profile for additional context
        const patient = await Patient.findOne({ userId: session.patientId });

        // Build patient data for prompt
        const patientData = {
            age: patient?.age,
            gender: patient?.gender,
            chiefComplaint: session.chiefComplaint,
            symptoms: session.symptoms,
            vitals: session.vitals,
            medicalHistory: session.medicalHistory,
        };

        // Step 1: Look up clinical context from knowledge base
        const clinicalMatches = lookupClinicalContext(session.symptoms, session.vitals);

        // Step 2: Build prompt with clinical context
        const prompt = buildTriagePrompt(patientData, clinicalMatches);

        // Step 3: Call Gemini
        const aiResult = await generateTriageResponse(prompt);

        // Step 4: Save AI recommendation
        const knowledgeBaseCluster =
            clinicalMatches.length > 0 ? clinicalMatches[0].clusterId : null;

        session.aiRecommendation = {
            urgency_level: aiResult.urgency_level,
            urgency_label: aiResult.urgency_label,
            primary_concern: aiResult.primary_concern,
            reasoning: aiResult.reasoning,
            recommended_actions: aiResult.recommended_actions || [],
            vital_flags: aiResult.vital_flags || [],
            clinician_notes: aiResult.clinician_notes,
            confidence: aiResult.confidence,
            knowledgeBaseCluster,
            disclaimer: aiResult.disclaimer,
            processedAt: new Date(),
        };

        session.status = 'awaiting_review';
        await session.save();

        // Save standalone AI recommendation for audit
        await AIRecommendation.create({
            sessionId: session._id,
            ...aiResult,
            knowledgeBaseCluster,
            rawResponse: JSON.stringify(aiResult),
        });

        // Step 5: Send critical alert email if urgency is CRITICAL
        if (aiResult.urgency_level === 1) {
            const patientUser = await require('../models/User.model').findById(session.patientId);
            // Non-blocking email — don't await
            sendCriticalAlert({
                to: process.env.EMAIL_USER, // Send to configured admin/clinician email
                patientName: patientUser?.name || 'Unknown Patient',
                urgencyLabel: aiResult.urgency_label,
                primaryConcern: aiResult.primary_concern,
                sessionId: session._id.toString(),
            }).catch((err) => console.error('Email alert failed:', err.message));
        }

        res.json({
            success: true,
            message: 'AI analysis complete',
            data: {
                session,
                knowledgeBaseMatches: clinicalMatches.length,
                matchedClusters: clinicalMatches.map((m) => m.clusterId),
            },
        });
    } catch (error) {
        // If analysis fails, revert status
        try {
            await TriageSession.findByIdAndUpdate(req.params.sessionId, {
                status: 'pending',
            });
        } catch { }
        next(error);
    }
};

// @desc    Get AI recommendation for a session
// @route   GET /api/ai/recommendation/:sessionId
const getRecommendation = async (req, res, next) => {
    try {
        const session = await TriageSession.findById(req.params.sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Triage session not found',
            });
        }

        if (!session.aiRecommendation || !session.aiRecommendation.urgency_level) {
            return res.status(404).json({
                success: false,
                message: 'No AI recommendation found for this session. Trigger analysis first.',
            });
        }

        res.json({
            success: true,
            data: { recommendation: session.aiRecommendation },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { analyzeSession, getRecommendation };
