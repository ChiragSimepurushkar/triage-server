const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        age: {
            type: Number,
            min: 0,
            max: 150,
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other', 'prefer_not_to_say'],
        },
        dateOfBirth: {
            type: Date,
        },
        bloodGroup: {
            type: String,
            enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
            default: 'unknown',
        },
        address: {
            street: String,
            city: String,
            state: String,
            pincode: String,
        },
        emergencyContact: {
            name: String,
            relationship: String,
            phone: String,
        },
        chronicConditions: [String],
        knownAllergies: {
            type: String,
            default: 'None known',
        },
        currentMedications: [String],
    },
    { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);
