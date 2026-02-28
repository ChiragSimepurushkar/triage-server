const TriageSession = require('../models/TriageSession.model');
const AIRecommendation = require('../models/AIRecommendation.model');
const Patient = require('../models/Patient.model');
const { lookupClinicalContext, buildTriagePrompt } = require('../services/triageEngine.service');
const { queryGraph, getGraphStats, exportGraphForVisualization, getClusterNeighbors, exportPatientGraph, getAvailableSymptomTags } = require('../services/graphEngine.service');
const { generateTriageResponse, initGemini } = require('../services/gemini.service');
const { buildPatientContextSummary, formatSummaryForPrompt } = require('../services/patientContextSummary.service');
const { calibrateConfidence } = require('../services/confidenceCalibration.service');
const { sendCriticalAlert } = require('../services/email.service');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

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

        // Step 1: Graph-based clinical context lookup
        const graphResult = queryGraph(
            session.symptoms,
            session.vitals,
            session.medicalHistory
        );

        // Step 2: Generate patient context summary
        const contextSummary = buildPatientContextSummary(patientData, graphResult);
        const contextSummaryText = formatSummaryForPrompt(contextSummary);

        // Step 3: Build graph-enhanced prompt with context summary
        const prompt = buildTriagePrompt(patientData, graphResult, contextSummaryText);

        // Step 4: Call Gemini
        const aiResult = await generateTriageResponse(prompt);

        // Step 5: Run confidence calibration (independent algorithmic layer)
        const calibration = calibrateConfidence({
            aiResult,
            graphResult,
            contextSummary,
            patientData,
        });

        console.log(`🎯 Confidence: ${calibration.confidenceScore}/100 (${calibration.confidenceLevel})${calibration.requiresHumanReview ? ' ⚠ FLAGGED FOR REVIEW' : ''}`);

        // Step 6: Save AI recommendation with calibrated confidence + reasoning traces
        const knowledgeBaseCluster =
            graphResult.primaryMatches.length > 0 ? graphResult.primaryMatches[0].clusterId : null;

        session.aiRecommendation = {
            urgency_level: aiResult.urgency_level,
            urgency_label: aiResult.urgency_label,
            primary_concern: aiResult.primary_concern,
            reasoning: aiResult.reasoning,
            reasoning_trace: aiResult.reasoning_trace || [],
            recommended_actions: aiResult.recommended_actions || [],
            vital_flags: aiResult.vital_flags || [],
            differentials_to_rule_out: aiResult.differentials_to_rule_out || [],
            clarifying_questions: aiResult.clarifying_questions || [],
            clinician_notes: aiResult.clinician_notes,
            confidence: calibration.confidenceLevel, // Use calibrated, not Gemini self-reported
            confidenceScore: calibration.confidenceScore,
            uncertaintyFlags: calibration.uncertaintyFlags,
            requiresHumanReview: calibration.requiresHumanReview,
            reviewReasons: calibration.reviewReasons,
            patientContextSummary: contextSummary,
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
            reasoning_trace: aiResult.reasoning_trace || [],
            differentials_to_rule_out: aiResult.differentials_to_rule_out || [],
            clarifying_questions: aiResult.clarifying_questions || [],
            confidenceScore: calibration.confidenceScore,
            confidence: calibration.confidenceLevel,
            uncertaintyFlags: calibration.uncertaintyFlags,
            requiresHumanReview: calibration.requiresHumanReview,
            reviewReasons: calibration.reviewReasons,
            patientContextSummary: contextSummary,
            knowledgeBaseCluster,
            rawResponse: JSON.stringify(aiResult),
        });

        // Step 7: Send critical alert email if urgency is CRITICAL
        if (aiResult.urgency_level === 1) {
            const patientUser = await require('../models/User.model').findById(session.patientId);
            sendCriticalAlert({
                to: process.env.EMAIL_USER,
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
                confidenceCalibration: {
                    score: calibration.confidenceScore,
                    level: calibration.confidenceLevel,
                    requiresHumanReview: calibration.requiresHumanReview,
                    flags: calibration.uncertaintyFlags.length,
                },
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

// @desc    Parse health data file with Gemini AI
// @route   POST /api/ai/parse-health-file
const parseHealthFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const geminiModel = initGemini();
        if (!geminiModel) {
            return res.status(503).json({ success: false, message: 'AI service not configured' });
        }

        const filePath = req.file.path;
        const fileName = req.file.originalname;
        const mimeType = req.file.mimetype;
        const ext = path.extname(fileName).toLowerCase();

        const PARSE_PROMPT = `You are a medical data extraction AI. Parse the following health data and extract structured information.

Return a JSON object with EXACTLY this structure (use empty arrays/objects for missing data):
{
  "symptoms": [{ "name": "symptom name", "severity": 5, "bodyArea": "area" }],
  "vitals": {
    "bloodPressureSystolic": number or null,
    "bloodPressureDiastolic": number or null,
    "heartRate": number or null,
    "temperature": number or null,
    "respiratoryRate": number or null,
    "oxygenSaturation": number or null
  },
  "conditions": ["condition1", "condition2"],
  "medications": [{ "name": "med name", "dosage": "dose", "frequency": "freq" }],
  "summary": "Brief summary of the health data found"
}

IMPORTANT:
- severity should be 1-10 scale
- bodyArea should be one of: Head, Chest, Abdomen, Back, Arms, Legs, Skin, General
- temperature in Celsius
- If a value is not found, use null for vitals and empty arrays for lists
- Extract as much data as possible from the file
- For images of medical reports, extract all visible values
`;

        let result;

        if (mimeType.startsWith('image/')) {
            // OCR-first approach: extract text with Tesseract.js, then send text to Gemini
            // This avoids expensive multimodal calls and 429 rate-limit errors
            console.log('🔍 Running Tesseract OCR on image...');
            const ocrResult = await Tesseract.recognize(filePath, 'eng');
            const ocrText = ocrResult.data?.text?.trim() || '';
            console.log(`📄 OCR extracted ${ocrText.length} characters`);

            if (ocrText.length > 50) {
                // Good OCR result — send as text to Gemini (much cheaper than multimodal)
                result = await geminiModel.generateContent(
                    PARSE_PROMPT + `\n\nOCR-extracted text from medical report image:\n${ocrText.slice(0, 15000)}`
                );
            } else {
                // OCR yielded very little text — fallback to Gemini multimodal
                console.log('⚠️ OCR text too short, falling back to Gemini multimodal...');
                const imageData = fs.readFileSync(filePath);
                const base64 = imageData.toString('base64');

                result = await geminiModel.generateContent([
                    PARSE_PROMPT + '\n\nThis is an image of a medical report. Extract all visible health data.',
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64,
                        },
                    },
                ]);
            }
        } else {
            // Text file (XML, JSON, CSV, etc.)
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Limit content to avoid token limits
            const truncated = fileContent.slice(0, 15000);

            result = await geminiModel.generateContent(
                PARSE_PROMPT + `\n\nFile type: ${ext}\nFile name: ${fileName}\n\nFile content:\n${truncated}`
            );
        }

        // Clean up temp file
        try { fs.unlinkSync(filePath); } catch { }

        const text = result.response.text();

        // Parse the JSON from Gemini's response
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1].trim());
            } else {
                const objMatch = text.match(/\{[\s\S]*\}/);
                if (objMatch) {
                    parsed = JSON.parse(objMatch[0]);
                } else {
                    return res.status(422).json({ success: false, message: 'Could not extract health data from this file. Try a different format.' });
                }
            }
        }

        res.json({
            success: true,
            message: 'Health data extracted successfully',
            data: {
                symptoms: parsed.symptoms || [],
                vitals: parsed.vitals || {},
                conditions: parsed.conditions || [],
                medications: parsed.medications || [],
                summary: parsed.summary || 'Data extracted from uploaded file',
            },
        });
    } catch (error) {
        // Clean up temp file on error
        if (req.file?.path) {
            try { fs.unlinkSync(req.file.path); } catch { }
        }
        console.error('Parse health file error:', error.message);
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

// @desc    Get patient-specific graph visualization with AI insight
// @route   GET /api/ai/graph/patient/:sessionId
const getPatientGraphVisualization = async (req, res, next) => {
    try {
        const session = await TriageSession.findById(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Triage session not found' });
        }

        // Step 1: Use Gemini to map patient symptoms to closest KB tags
        let enrichedSymptoms = [...(session.symptoms || [])];
        try {
            const geminiModel = initGemini();
            if (geminiModel && session.symptoms?.length > 0) {
                const availableTags = getAvailableSymptomTags();
                const symptomNames = session.symptoms.map((s) =>
                    typeof s === 'string' ? s : s.name || ''
                ).filter(Boolean);

                const mapPrompt = `You are a medical terminology mapper. Map each patient symptom below to the closest matching tags from the clinical knowledge base.

PATIENT SYMPTOMS: ${symptomNames.join(', ')}

AVAILABLE KB TAGS: ${availableTags.join(', ')}

For each patient symptom, find 1-3 closest matching KB tags. A match can be a synonym, related concept, or the same body system.

Respond ONLY with a JSON array of objects, no markdown:
[{"symptom": "original symptom", "mapped_tags": ["tag1", "tag2"]}]`;

                const mapResult = await geminiModel.generateContent(mapPrompt);
                const mapText = mapResult.response.text();

                let parsed;
                try {
                    parsed = JSON.parse(mapText);
                } catch {
                    const jsonMatch = mapText.match(/\[\s*\{[\s\S]*\}\s*\]/);
                    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
                }

                if (Array.isArray(parsed)) {
                    for (const mapping of parsed) {
                        for (const tag of mapping.mapped_tags || []) {
                            const clean = tag.trim().replace(/\s+/g, ' ');
                            if (clean && !symptomNames.some((s) => s.toLowerCase() === clean.toLowerCase())) {
                                enrichedSymptoms.push({ name: clean, severity: 3, duration: 'mapped' });
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Symptom mapping failed (continuing with originals):', err.message);
        }

        // Step 2: Generate patient-highlighted graph with enriched symptoms
        const result = exportPatientGraph({
            symptoms: enrichedSymptoms,
            vitals: session.vitals,
            medicalHistory: session.medicalHistory,
        });

        // Build a focused AI clinical narrative for the highlighted graph
        let aiInsight = null;
        try {
            const geminiModel = initGemini();
            if (geminiModel) {
                const highlightedNodes = result.graph.nodes.filter((n) => n.highlighted);
                const primaryClusters = highlightedNodes.filter((n) => n.highlightType === 'primary_match');
                const diffClusters = highlightedNodes.filter((n) => n.highlightType === 'differential');
                const riskNodes = highlightedNodes.filter((n) => n.highlightType === 'risk_amplifier');
                const symptomNodes = highlightedNodes.filter((n) => n.highlightType === 'matched_symptom');

                const insightPrompt = `You are a clinical decision support AI helping a doctor understand a patient's condition through a clinical knowledge graph.

The patient's data has been mapped onto a clinical knowledge graph. Here is what was found:

MATCHED SYMPTOM CLUSTERS (primary conditions matching the patient):
${primaryClusters.map((c) => `- ${c.label} [${c.urgency_label}]: ${c.highlightReason}`).join('\n') || 'None'}

PATIENT SYMPTOMS FOUND IN GRAPH:
${symptomNodes.map((s) => `- ${s.label}`).join('\n') || 'None'}

DIFFERENTIAL DIAGNOSES (connected conditions to consider):
${diffClusters.map((d) => `- ${d.label} [${d.urgency_label}]: ${d.highlightReason}`).join('\n') || 'None'}

PATIENT RISK AMPLIFIERS (from medical history):
${riskNodes.map((r) => `- ${r.label}: ${r.highlightReason}`).join('\n') || 'None'}

PATIENT VITALS: BP ${session.vitals?.bp_systolic || '?'}/${session.vitals?.bp_diastolic || '?'}, HR ${session.vitals?.heart_rate || '?'}bpm, SpO2 ${session.vitals?.spo2 || '?'}%, Temp ${session.vitals?.temperature || '?'}°C
CHIEF COMPLAINT: ${session.chiefComplaint || 'Not specified'}

Provide a concise clinical narrative (3-5 sentences) for the reviewing doctor explaining:
1. What the highlighted graph connections reveal about this patient's condition
2. Which connections are most clinically significant and why
3. What the doctor should pay closest attention to

Respond as plain text only, no JSON. Write for a medical professional.`;

                const aiResult = await geminiModel.generateContent(insightPrompt);
                aiInsight = aiResult.response.text();
            }
        } catch (err) {
            console.error('AI insight generation failed:', err.message);
            aiInsight = null;
        }

        res.json({
            success: true,
            data: {
                graph: result.graph,
                queryResult: result.queryResult,
                aiInsight,
                session: {
                    _id: session._id,
                    chiefComplaint: session.chiefComplaint,
                    patientId: session.patientId,
                    symptoms: session.symptoms,
                    vitals: session.vitals,
                    medicalHistory: session.medicalHistory,
                    aiRecommendation: session.aiRecommendation,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    analyzeSession,
    getRecommendation,
    parseHealthFile,
    getGraphStatsHandler,
    getGraphVisualization,
    getClusterDetail,
    getPatientGraphVisualization,
};
