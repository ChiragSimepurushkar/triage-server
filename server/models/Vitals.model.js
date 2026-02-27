const mongoose = require('mongoose');

const vitalsSchema = new mongoose.Schema(
    {
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TriageSession',
            required: true,
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        bp_systolic: {
            type: Number,
            min: 50,
            max: 300,
        },
        bp_diastolic: {
            type: Number,
            min: 20,
            max: 200,
        },
        heart_rate: {
            type: Number,
            min: 20,
            max: 300,
        },
        spo2: {
            type: Number,
            min: 0,
            max: 100,
        },
        temperature: {
            type: Number,
            min: 30,
            max: 45,
        },
        respiratory_rate: {
            type: Number,
            min: 5,
            max: 60,
        },
        recordedAt: {
            type: Date,
            default: Date.now,
        },
        notes: String,
    },
    { timestamps: true }
);

module.exports = mongoose.model('Vitals', vitalsSchema);
