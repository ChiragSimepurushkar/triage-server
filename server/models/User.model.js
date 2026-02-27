const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: 6,
            select: false,
        },
        role: {
            type: String,
            enum: ['patient', 'clinician', 'admin'],
            default: 'patient',
        },
        phone: {
            type: String,
            trim: true,
        },
        avatar: {
            type: String,
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        otp: {
            type: String,
            select: false,
        },
        otpExpires: {
            type: Date,
            select: false,
        },
        refreshToken: {
            type: String,
            select: false,
        },
    },
    { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate default avatar URL from name
userSchema.methods.getAvatar = function () {
    if (this.avatar) return this.avatar;
    const encoded = encodeURIComponent(this.name || 'U');
    return `https://ui-avatars.com/api/?name=${encoded}&background=0D9488&color=fff&size=200&bold=true`;
};

module.exports = mongoose.model('User', userSchema);
