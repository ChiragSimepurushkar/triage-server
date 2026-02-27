const Patient = require('../models/Patient.model');

// @desc    Get patient profile
// @route   GET /api/patients/profile
const getProfile = async (req, res, next) => {
    try {
        const patient = await Patient.findOne({ userId: req.user._id }).populate(
            'userId',
            'name email phone'
        );

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient profile not found',
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

        const patient = await Patient.findOneAndUpdate(
            { userId: req.user._id },
            {
                age,
                gender,
                dateOfBirth,
                bloodGroup,
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
                message: 'Patient profile not found',
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
