const express = require('express');
const router = express.Router();
const { analyzeSession, getRecommendation, parseHealthFile } = require('../controllers/ai.controller');
const { protect } = require('../middleware/auth.middleware');
const multer = require('multer');

// Multer for temp file uploads (health report files)
const upload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'text/xml', 'application/xml',
            'application/json', 'text/csv',
            'text/plain',
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'application/pdf',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xml|json|csv|fit|gpx|tcx|txt|jpg|jpeg|png|webp)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type. Upload XML, JSON, CSV, or an image of your report.'));
        }
    },
});

router.post('/analyze/:sessionId', protect, analyzeSession);
router.get('/recommendation/:sessionId', protect, getRecommendation);
router.post('/parse-health-file', protect, upload.single('healthFile'), parseHealthFile);

module.exports = router;
