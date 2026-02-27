const express = require('express');
const router = express.Router();
const { analyzeSession, getRecommendation } = require('../controllers/ai.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/analyze/:sessionId', protect, analyzeSession);
router.get('/recommendation/:sessionId', protect, getRecommendation);

module.exports = router;
