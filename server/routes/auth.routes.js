const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { uploadAvatar: uploadMiddleware } = require('../middleware/upload.middleware');
const { register, login, refreshToken, logout, getMe, sendOtp, verifyOtp, uploadAvatar } = require('../controllers/auth.controller');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/avatar', protect, uploadMiddleware.single('avatar'), uploadAvatar);

module.exports = router;
