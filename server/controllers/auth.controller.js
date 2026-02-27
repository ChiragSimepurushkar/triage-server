const User = require('../models/User.model');
const Patient = require('../models/Patient.model');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const { createNotification } = require('./notification.controller');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ─── Email transporter ───────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ─── Helper: generate 6-digit OTP ────────────────────────────────────────────
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

// ─── Helper: send OTP email ──────────────────────────────────────────────────
async function sendOtpEmail(email, otp, purpose = 'verify your email') {
    await transporter.sendMail({
        from: `"TriageIQ" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `TriageIQ — Your verification code is ${otp}`,
        html: `
            <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:30px;background:#0A0A0A;border-radius:12px;border:1px solid #1a1a1a">
                <h2 style="color:#00E5CC;margin:0 0 8px">TriageIQ</h2>
                <p style="color:#ccc;font-size:14px;margin:0 0 24px">Use this code to ${purpose}:</p>
                <div style="background:#111;border-radius:8px;padding:20px;text-align:center;border:1px solid #222">
                    <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#00E5CC">${otp}</span>
                </div>
                <p style="color:#888;font-size:12px;margin:18px 0 0">This code expires in 5 minutes. Do not share it.</p>
            </div>
        `,
    });
}

// ─── Helper: build user response object ──────────────────────────────────────
function buildUserResponse(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.getAvatar(),
        isEmailVerified: user.isEmailVerified,
    };
}

// @desc    Register — Step 1: create user & send OTP
// @route   POST /api/auth/register
const register = async (req, res, next) => {
    try {
        const { name, email, password, role, phone } = req.body;

        // ── Detailed validation ──
        const errors = [];
        if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters');
        if (!email) {
            errors.push('Email is required');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('Please enter a valid email address');
        }
        if (!password) {
            errors.push('Password is required');
        } else {
            if (password.length < 6) errors.push('Password must be at least 6 characters');
            if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
            if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
            if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
        }
        if (phone && !/^\+?[\d\s-]{7,15}$/.test(phone)) {
            errors.push('Please enter a valid phone number (e.g. +91 98765 43210)');
        }
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists. Try signing in instead.' });
        }

        // Create user (not yet verified)
        const user = await User.create({ name: name.trim(), email, password, role, phone, isEmailVerified: false });

        // If patient, create patient profile
        if (user.role === 'patient') {
            await Patient.create({ userId: user._id });
        }

        // Generate and save OTP
        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min
        await user.save({ validateBeforeSave: false });

        // Send OTP email
        await sendOtpEmail(email, otp, 'verify your email');

        res.status(201).json({
            success: true,
            message: 'OTP sent to your email. Please verify to complete registration.',
            data: { email, requiresOtp: true },
        });
    } catch (error) {
        // Catch mongoose validation errors and format them nicely
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(400).json({ success: false, message: messages.join('. '), errors: messages });
        }
        next(error);
    }
};

// @desc    Verify OTP (for registration or login)
// @route   POST /api/auth/verify-otp
const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp, purpose } = req.body; // purpose: 'register' or 'login'

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }

        const user = await User.findOne({ email }).select('+otp +otpExpires +password');
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        // Check OTP validity
        if (!user.otp || user.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
        if (user.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        // Clear OTP & mark verified
        user.otp = undefined;
        user.otpExpires = undefined;
        user.isEmailVerified = true;

        // Generate tokens
        const accessToken = generateAccessToken(user._id, user.role);
        const refreshToken = generateRefreshToken(user._id, user.role);
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        // Set cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Create welcome notification for new registrations
        if (purpose === 'register') {
            await createNotification(
                user._id,
                'Welcome to TriageIQ!',
                `Your account has been created successfully. Start your first triage session now.`,
                'success',
                '/triage/new'
            );
        }

        res.json({
            success: true,
            message: purpose === 'register' ? 'Email verified! Account activated.' : 'Login verified!',
            data: {
                user: buildUserResponse(user),
                accessToken,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Send OTP (for login 2FA or resend)
// @route   POST /api/auth/send-otp
const sendOtp = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'No account found with this email' });
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
        await user.save({ validateBeforeSave: false });

        await sendOtpEmail(email, otp, 'verify your identity');

        res.json({ success: true, message: 'OTP sent to your email' });
    } catch (error) {
        next(error);
    }
};

// @desc    Login — Step 1: validate credentials & send OTP
// @route   POST /api/auth/login
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // ── Detailed validation ──
        const errors = [];
        if (!email) {
            errors.push('Email is required');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('Please enter a valid email address');
        }
        if (!password) errors.push('Password is required');
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join('. '), errors });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'No account found with this email. Check for typos or sign up.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
        }

        if (!user.isActive) {
            return res.status(401).json({ success: false, message: 'Your account has been deactivated. Contact support for help.' });
        }

        // Generate and send OTP for 2FA
        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
        await user.save({ validateBeforeSave: false });

        await sendOtpEmail(email, otp, 'sign in to your account');

        res.json({
            success: true,
            message: 'OTP sent to your email. Please verify to complete login.',
            data: { email, requiresOtp: true },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
const refreshTokenHandler = async (req, res, next) => {
    try {
        const token = req.cookies.refreshToken || req.body.refreshToken;

        if (!token) {
            return res.status(401).json({ success: false, message: 'No refresh token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id).select('+refreshToken');
        if (!user || user.refreshToken !== token) {
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        }

        const accessToken = generateAccessToken(user._id, user.role);
        res.json({ success: true, data: { accessToken } });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
};

// @desc    Logout user
// @route   POST /api/auth/logout
const logout = async (req, res, next) => {
    try {
        if (req.user) {
            await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
        }
        res.clearCookie('refreshToken');
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({
            success: true,
            data: { user: buildUserResponse(user) },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Upload / update avatar
// @route   POST /api/auth/avatar
const uploadAvatar = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { avatar: req.file.path },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Avatar updated',
            data: { avatar: user.getAvatar() },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { register, login, refreshToken: refreshTokenHandler, logout, getMe, sendOtp, verifyOtp, uploadAvatar };
