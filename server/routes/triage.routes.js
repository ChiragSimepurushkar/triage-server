const express = require('express');
const router = express.Router();
const {
    createSession,
    getSessionById,
    getPatientSessions,
    updateSession,
} = require('../controllers/triage.controller');
const { addVitals, getVitalsBySession } = require('../controllers/vitals.controller');
const { protect } = require('../middleware/auth.middleware');

// Triage session routes
router.post('/', protect, createSession);
router.get('/my-sessions', protect, getPatientSessions);
router.get('/:id', protect, getSessionById);
router.put('/:id', protect, updateSession);

// Vitals sub-routes under triage session
router.post('/:sessionId/vitals', protect, addVitals);
router.get('/:sessionId/vitals', protect, getVitalsBySession);

module.exports = router;
