const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { errorHandler } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const patientRoutes = require('./routes/patient.routes');
const triageRoutes = require('./routes/triage.routes');
const aiRoutes = require('./routes/ai.routes');
const clinicianRoutes = require('./routes/clinician.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();

// --- Middleware ---
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'TriageIQ API', timestamp: new Date().toISOString() });
});

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/triage', triageRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/clinician', clinicianRoutes);
app.use('/api/analytics', analyticsRoutes);

// --- 404 Handler ---
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// --- Global Error Handler ---
app.use(errorHandler);

module.exports = app;
