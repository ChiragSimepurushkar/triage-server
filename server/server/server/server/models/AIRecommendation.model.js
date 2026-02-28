const mongoose = require('mongoose');

const aiRecommendationSchema = new mongoose.Schema(
    {
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TriageSession',
            required: true,
        },
        urgency_level: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        urgency_label: {
            type: String,
            required: true,
            enum: ['CRITICAL', 'URGENT', 'MODERATE', 'LOW', 'OBSERVATION'],
        },
        primary_concern: String,
        reasoning: String,
        recommended_actions: [String],
        vital_flags: [String],
        clinician_notes: String,
        confidence: {
            type: String,
            enum: ['HIGH', 'MEDIUM', 'LOW'],
        },
        knowledgeBaseCluster: String,
        disclaimer: {
            type: String,
            default:
                'This is AI-assisted triage support only. Clinical judgment of the reviewing clinician supersedes this recommendation.',
        },
        rawResponse: String,
    },
    { timestamps: true }
);

module.exports = mongoose.model('AIRecommendation', aiRecommendationSchema);
