const express = require('express');
const router = express.Router();
const {
    getTriageQueue,
    reviewSession,
    addOverride,
    closeSession,
} = require('../controllers/clinician.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

router.get('/queue', protect, requireRole('clinician', 'admin'), getTriageQueue);
router.put('/review/:id', protect, requireRole('clinician', 'admin'), reviewSession);
router.put('/override/:id', protect, requireRole('clinician', 'admin'), addOverride);
router.put('/close/:id', protect, requireRole('clinician', 'admin'), closeSession);

module.exports = router;
