const mongoose = require('mongoose');

const clinicalVectorSchema = new mongoose.Schema(
    {
        clusterId: {
            type: String,
            required: true,
            index: true,
        },
        chunkType: {
            type: String,
            enum: ['clinical_context', 'presentation', 'symptoms', 'actions', 'contraindications'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        embedding: {
            type: [Number],
            required: true,
        },
        metadata: {
            urgency_level: Number,
            urgency_label: String,
            tags: [String],
        },
    },
    { timestamps: true }
);

// Compound index for dedup checks
clinicalVectorSchema.index({ clusterId: 1, chunkType: 1 }, { unique: true });

module.exports = mongoose.model('ClinicalVector', clinicalVectorSchema);
