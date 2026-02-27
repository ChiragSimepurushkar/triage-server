const Patient = require('../models/Patient.model');
const User = require('../models/User.model');

// @desc    Get patient profile
// @route   GET /api/patients/profile
const getProfile = async (req, res, next) => {
    try {
        const patient = await Patient.findOne({ userId: req.user._id }).populate(
            'userId',
            'name email phone avatar'
        );

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient profile not found. Please contact support.',
            });
        }

        res.json({
            success: true,
            data: { patient },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update patient profile
// @route   PUT /api/patients/profile
const updateProfile = async (req, res, next) => {
    try {
        const {
            phone,
            age,
            gender,
            dateOfBirth,
            bloodGroup,
            address,
            emergencyContact,
            chronicConditions,
            knownAllergies,
            currentMedications,
        } = req.body;

        // ── Validation ──
        const errors = [];
        if (phone !== undefined && phone.trim().length > 0 && !/^\+?[\d\s\-]{7,15}$/.test(phone)) {
            errors.push('Phone number is invalid. Use format like +91 98765 43210');
        }
        if (age !== undefined && (age < 0 || age > 150)) {
            errors.push('Age must be between 0 and 150');
        }
        if (gender !== undefined && gender !== '' && !['male', 'female', 'other', 'prefer_not_to_say'].includes(gender)) {
            errors.push('Gender must be one of: male, female, other, prefer_not_to_say');
        }
        if (bloodGroup !== undefined && bloodGroup !== '' && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'].includes(bloodGroup)) {
            errors.push('Blood group must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-');
        }
        if (dateOfBirth !== undefined && dateOfBirth !== '') {
            const dob = new Date(dateOfBirth);
            if (isNaN(dob.getTime())) {
                errors.push('Date of birth is not a valid date');
            } else if (dob > new Date()) {
                errors.push('Date of birth cannot be in the future');
            }
        }
        if (emergencyContact) {
            if (emergencyContact.phone && !/^\+?[\d\s\-]{7,15}$/.test(emergencyContact.phone)) {
                errors.push('Emergency contact phone number is invalid');
            }
        }
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        // Update phone on User model
        if (phone !== undefined) {
            await User.findByIdAndUpdate(req.user._id, { phone });
        }

        const patient = await Patient.findOneAndUpdate(
            { userId: req.user._id },
            {
                age,
                gender: gender || undefined,
                dateOfBirth: dateOfBirth || undefined,
                bloodGroup: bloodGroup || undefined,
                address,
                emergencyContact,
                chronicConditions,
                knownAllergies,
                currentMedications,
            },
            { new: true, runValidators: true }
        );

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient profile not found. Please contact support.',
            });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: { patient },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getProfile, updateProfile };
