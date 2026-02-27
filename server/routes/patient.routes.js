const express = require('express');
const router = express.Router();
const { getProfile, updateProfile } = require('../controllers/patient.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

router.get('/profile', protect, requireRole('patient'), getProfile);
router.put('/profile', protect, requireRole('patient'), updateProfile);

module.exports = router;
