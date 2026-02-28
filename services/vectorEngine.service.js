/**
 * Vector RAG Engine Service
 *
 * Embeds the clinical knowledge base into MongoDB as vectors,
 * then provides semantic similarity search alongside the Graph RAG.
 *
 * Uses Gemini text-embedding-004 (768-dim) for embeddings and
 * cosine similarity for retrieval.
 */

const ClinicalVector = require('../models/ClinicalVector.model');
const { embedText, initGemini } = require('./gemini.service');
const fs = require('fs');
const path = require('path');

let vectorReady = false;

// ── Cosine similarity ─────────────────────────────────────────────────────────

const cosineSimilarity = (a, b) => {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

// ── Initialization: embed KB and upsert into MongoDB ──────────────────────────

/**
 * Initialize the vector engine.
 * Loads the knowledge base, creates text chunks, embeds them,
 * and stores them in MongoDB. Skips already-embedded chunks.
 */
const initVectorEngine = async () => {
    try {
        initGemini(); // Ensure embedding model is ready

        const kbPath = path.join(__dirname, '..', 'knowledge', 'clinicalKnowledgeBase.json');
        const raw = fs.readFileSync(kbPath, 'utf-8');
        const kb = JSON.parse(raw);

        const clusters = kb.symptom_clusters || [];
        console.log(`🧬 Vector Engine: Processing ${clusters.length} clusters...`);

        // Check how many are already embedded
        const existingCount = await ClinicalVector.countDocuments();
        const expectedChunks = clusters.length; // 1 combined chunk per cluster

        if (existingCount >= expectedChunks) {
            console.log(`✅ Vector Engine: ${existingCount} vectors already stored. Skipping re-embedding.`);
            vectorReady = true;
            return;
        }

        // Clear stale vectors and re-embed
        if (existingCount > 0) {
            console.log(`♻️  Vector Engine: Re-embedding (${existingCount} stale docs found)...`);
            await ClinicalVector.deleteMany({});
        }

        let embedded = 0;

        for (const cluster of clusters) {
            // Build one rich text chunk per cluster combining all clinical info
            const textParts = [];

            textParts.push(`Condition: ${cluster.id.replace(/_/g, ' ')}`);
            textParts.push(`Urgency: ${cluster.urgency_label || 'Unknown'}`);

            if (cluster.tags?.length > 0) {
                textParts.push(`Symptoms and signs: ${cluster.tags.join(', ')}`);
            }
            if (cluster.clinical_context) {
                textParts.push(`Clinical context: ${cluster.clinical_context}`);
            }
            if (cluster.presentation) {
                textParts.push(`Typical presentation: ${cluster.presentation}`);
            }
            if (cluster.next_actions?.length > 0) {
                textParts.push(`Recommended actions: ${cluster.next_actions.join('; ')}`);
            }
            if (cluster.contraindications?.length > 0) {
                textParts.push(`Contraindications: ${cluster.contraindications.join('; ')}`);
            }
            if (cluster.differential_diagnoses?.length > 0) {
                textParts.push(`Related conditions: ${cluster.differential_diagnoses.join(', ')}`);
            }

            const content = textParts.join('. ');

            try {
                const embedding = await embedText(content);

                await ClinicalVector.create({
                    clusterId: cluster.id,
                    chunkType: 'clinical_context',
                    content,
                    embedding,
                    metadata: {
                        urgency_level: cluster.urgency_level,
                        urgency_label: cluster.urgency_label,
                        tags: cluster.tags || [],
                    },
                });

                embedded++;
            } catch (err) {
                console.error(`⚠️  Failed to embed ${cluster.id}: ${err.message}`);
            }

            // Rate limit: small delay between embeddings to avoid 429s
            if (embedded < clusters.length) {
                await new Promise((r) => setTimeout(r, 200));
            }
        }

        console.log(`✅ Vector Engine: ${embedded}/${clusters.length} clusters embedded and stored.`);
        vectorReady = true;
    } catch (error) {
        console.error('❌ Vector Engine initialization failed:', error.message);
        // Non-fatal — Graph RAG still works
        vectorReady = false;
    }
};

// ── Semantic search ───────────────────────────────────────────────────────────

/**
 * Search for the most semantically similar knowledge chunks.
 * Falls back gracefully if vectors aren't ready.
 *
 * @param {string} query - Patient chief complaint + symptom description
 * @param {number} topK - Number of results to return (default 5)
 * @returns {{ matches: Array, searchedWith: string }}
 */
const searchSimilar = async (query, topK = 5) => {
    if (!vectorReady) {
        return { matches: [], searchedWith: query, fallback: true };
    }

    try {
        // Embed the patient's query
        const queryEmbedding = await embedText(query);

        // Retrieve all vectors (small dataset, ~22 docs)
        const allVectors = await ClinicalVector.find({}).lean();

        // Compute cosine similarity for each
        const scored = allVectors.map((doc) => ({
            clusterId: doc.clusterId,
            chunkType: doc.chunkType,
            content: doc.content,
            similarity: cosineSimilarity(queryEmbedding, doc.embedding),
            metadata: doc.metadata,
        }));

        // Sort by similarity descending, take top-K
        scored.sort((a, b) => b.similarity - a.similarity);
        const matches = scored.slice(0, topK).filter((m) => m.similarity > 0.3); // Threshold

        return {
            matches,
            searchedWith: query,
            totalVectors: allVectors.length,
        };
    } catch (error) {
        console.error('Vector search failed:', error.message);
        return { matches: [], searchedWith: query, error: error.message };
    }
};

// ── Stats ─────────────────────────────────────────────────────────────────────

const getVectorStats = async () => {
    const count = await ClinicalVector.countDocuments();
    return { totalVectors: count, ready: vectorReady };
};

module.exports = { initVectorEngine, searchSimilar, getVectorStats };
