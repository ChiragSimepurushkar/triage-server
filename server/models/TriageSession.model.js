const mongoose = require('mongoose');

const triageSessionSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'ai_processing', 'awaiting_review', 'reviewed', 'closed'],
            default: 'pending',
        },
        chiefComplaint: {
            type: String,
            required: [true, 'Chief complaint is required'],
            trim: true,
        },
        symptoms: [
            {
                name: { type: String, required: true },
                severity: { type: Number, min: 1, max: 10, default: 5 },
                duration: { type: String },
            },
        ],
        vitals: {
            bp_systolic: { type: Number },
            bp_diastolic: { type: Number },
            heart_rate: { type: Number },
            spo2: { type: Number },
            temperature: { type: Number },
            respiratory_rate: { type: Number },
        },
        medicalHistory: {
            conditions: [String],
            medications: [String],
            allergies: { type: String, default: 'None known' },
        },
        aiRecommendation: {
            urgency_level: { type: Number, min: 1, max: 5 },
            urgency_label: {
                type: String,
                enum: ['CRITICAL', 'URGENT', 'MODERATE', 'LOW', 'OBSERVATION'],
            },
            primary_concern: String,
            reasoning: String,
            reasoning_trace: [
                {
                    step: String,
                    finding: String,
                },
            ],
            recommended_actions: [String],
            vital_flags: [String],
            differentials_to_rule_out: [String],
            clarifying_questions: [String],
            clinician_notes: String,
            confidence: {
                type: String,
                enum: ['HIGH', 'MEDIUM', 'LOW'],
            },
            confidenceScore: { type: Number, min: 0, max: 100 },
            uncertaintyFlags: [
                {
                    type: String,
                    severity: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },
                    message: String,
                },
            ],
            requiresHumanReview: { type: Boolean, default: false },
            reviewReasons: [String],
            patientContextSummary: { type: mongoose.Schema.Types.Mixed },
            knowledgeBaseCluster: String,
            disclaimer: {
                type: String,
                default:
                    'This is AI-assisted triage support only. Clinical judgment of the reviewing clinician supersedes this recommendation.',
            },
            processedAt: Date,
        },
        clinicianOverride: {
            clinicianId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            notes: String,
            finalUrgency: { type: Number, min: 1, max: 5 },
            finalUrgencyLabel: String,
            timestamp: Date,
        },
        assignedClinician: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

// Index for sorting queue by urgency
triageSessionSchema.index({ 'aiRecommendation.urgency_level': 1, createdAt: -1 });
triageSessionSchema.index({ patientId: 1, createdAt: -1 });
triageSessionSchema.index({ status: 1 });

module.exports = mongoose.model('TriageSession', triageSessionSchema);
