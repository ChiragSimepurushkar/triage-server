const TriageSession = require('../models/TriageSession.model');
const AIRecommendation = require('../models/AIRecommendation.model');
const Patient = require('../models/Patient.model');
const { lookupClinicalContext, buildTriagePrompt } = require('../services/triageEngine.service');
const { generateTriageResponse, initGemini } = require('../services/gemini.service');
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

module.exports = { analyzeSession, getRecommendation, parseHealthFile };
