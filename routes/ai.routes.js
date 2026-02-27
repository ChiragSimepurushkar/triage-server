const express = require('express');
const router = express.Router();
const {
    analyzeSession,
    getRecommendation,
    getGraphStatsHandler,
    getGraphVisualization,
    getClusterDetail,
} = require('../controllers/ai.controller');
const { protect } = require('../middleware/auth.middleware');

// AI analysis routes
router.post('/analyze/:sessionId', protect, analyzeSession);
router.get('/recommendation/:sessionId', protect, getRecommendation);

// Graph API routes (public for frontend visualization, protected for dev/demo)
router.get('/graph/stats', getGraphStatsHandler);
router.get('/graph/visualize', getGraphVisualization);
router.get('/graph/cluster/:clusterId', getClusterDetail);

module.exports = router;
