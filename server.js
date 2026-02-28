require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { buildGraph } = require('./services/graphEngine.service');
const { initVectorEngine } = require('./services/vectorEngine.service');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB, build knowledge graph + vector store, then start server
connectDB().then(async () => {
    // Build in-memory clinical knowledge graph from KB JSON
    buildGraph();

    // Embed KB into vector store (skips if already done)
    await initVectorEngine();

    app.listen(PORT, () => {
        console.log(`🚀 TriageIQ Server running on port ${PORT}`);
        console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔗 Graph stats: http://localhost:${PORT}/api/ai/graph/stats`);
    });
});
