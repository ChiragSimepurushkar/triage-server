const TriageSession = require('../models/TriageSession.model');
const AIRecommendation = require('../models/AIRecommendation.model');
const Patient = require('../models/Patient.model');
const { buildTriagePrompt } = require('../services/triageEngine.service');
const { queryGraph, getGraphStats, exportGraphForVisualization, getClusterNeighbors } = require('../services/graphEngine.service');
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

        // Step 1: Graph-based clinical context lookup (replaces flat lookup)
        const graphResult = queryGraph(
            session.symptoms,
            session.vitals,
            session.medicalHistory
        );

        // Step 2: Build graph-enhanced prompt
        const prompt = buildTriagePrompt(patientData, graphResult);

        // Step 3: Call Gemini
        const aiResult = await generateTriageResponse(prompt);

        // Step 4: Save AI recommendation
        const knowledgeBaseCluster =
            graphResult.primaryMatches.length > 0 ? graphResult.primaryMatches[0].clusterId : null;

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
                graphTraversal: graphResult.graphTraversal,
                matchedClusters: graphResult.primaryMatches.map((m) => m.clusterId),
                differentials: graphResult.differentials.map((d) => d.clusterId),
                riskAmplifiers: graphResult.riskMatches.map((r) => ({
                    factor: r.riskFactor,
                    cluster: r.amplifiedCluster,
                })),
                clarifyingQuestions: graphResult.clarifyingQuestions.map((q) => q.question),
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

// @desc    Get clinical knowledge graph stats
// @route   GET /api/ai/graph/stats
const getGraphStatsHandler = (req, res) => {
    res.json({ success: true, data: getGraphStats() });
};

// @desc    Export graph for frontend visualization
// @route   GET /api/ai/graph/visualize
const getGraphVisualization = (req, res) => {
    res.json({ success: true, data: exportGraphForVisualization() });
};

// @desc    Get cluster neighbors (symptoms, differentials, risks)
// @route   GET /api/ai/graph/cluster/:clusterId
const getClusterDetail = (req, res) => {
    const result = getClusterNeighbors(req.params.clusterId);
    if (!result) {
        return res.status(404).json({ success: false, message: 'Cluster not found in graph' });
    }
    res.json({ success: true, data: result });
};

module.exports = {
    analyzeSession,
    getRecommendation,
    getGraphStatsHandler,
    getGraphVisualization,
    getClusterDetail,
};
