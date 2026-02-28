/**
 * Confidence Calibration Service
 *
 * Independent algorithmic layer that scores confidence AFTER Gemini responds.
 * This is NOT Gemini self-reporting — it's a deterministic check that flags
 * uncertain cases for mandatory human review.
 *
 * Factors:
 *  1. Data Completeness   (22%) — how much patient data was provided
 *  2. Graph Match Strength (22%) — how strongly symptoms matched KB clusters
 *  3. Vital Consistency    (18%) — do vitals corroborate the urgency?
 *  4. AI-KB Agreement      (18%) — does Gemini agree with the graph's urgency?
 *  5. Symptom Specificity  (10%) — vague vs. specific symptom descriptions
 *  6. Semantic Match Quality(10%) — do vector search results corroborate?
 */

// ── Urgency level to label map ──
const URGENCY_MAP = { 1: 'CRITICAL', 2: 'URGENT', 3: 'MODERATE', 4: 'LOW', 5: 'OBSERVATION' };

/**
 * Main calibration function
 * @param {object} params
 * @param {object} params.aiResult       - Gemini's returned JSON
 * @param {object} params.graphResult    - Result from queryGraph()
 * @param {object} params.contextSummary - From buildPatientContextSummary()
 * @param {object} params.patientData    - Raw patient data
 * @returns {object} Calibrated confidence result
 */
const calibrateConfidence = ({ aiResult, graphResult, vectorResult, contextSummary, patientData }) => {
    const factors = {};
    const uncertaintyFlags = [];

    // ── Factor 1: Data Completeness (22%) ──
    const completeness = contextSummary.completenessScore;
    factors.dataCompleteness = {
        score: completeness,
        weight: 0.22,
        weighted: Math.round(completeness * 0.22),
    };
    if (completeness < 40) {
        uncertaintyFlags.push({
            type: 'DATA_INCOMPLETE',
            severity: 'HIGH',
            message: `Only ${completeness}% of expected patient data was provided. Missing: ${contextSummary.dataGaps.slice(0, 3).join(', ')}`,
        });
    } else if (completeness < 70) {
        uncertaintyFlags.push({
            type: 'DATA_PARTIAL',
            severity: 'MEDIUM',
            message: `Data completeness is ${completeness}%. Some key data may be missing.`,
        });
    }

    // ── Factor 2: Graph Match Strength (22%) ──
    const graphScore = calculateGraphMatchStrength(graphResult);
    factors.graphMatchStrength = {
        score: graphScore,
        weight: 0.22,
        weighted: Math.round(graphScore * 0.22),
    };
    if (graphScore < 30) {
        uncertaintyFlags.push({
            type: 'NO_KB_MATCH',
            severity: 'HIGH',
            message: 'Symptoms did not strongly match any known clinical clusters in the knowledge base. AI assessment is based primarily on general medical knowledge.',
        });
    }

    // ── Factor 3: Vital Consistency (18%) ──
    const vitalScore = calculateVitalConsistency(aiResult, contextSummary);
    factors.vitalConsistency = {
        score: vitalScore.score,
        weight: 0.18,
        weighted: Math.round(vitalScore.score * 0.18),
    };
    for (const flag of vitalScore.flags) {
        uncertaintyFlags.push(flag);
    }

    // ── Factor 4: AI-KB Agreement (18%) ──
    const agreementScore = calculateAIKBAgreement(aiResult, graphResult);
    factors.aiKbAgreement = {
        score: agreementScore.score,
        weight: 0.18,
        weighted: Math.round(agreementScore.score * 0.18),
    };
    for (const flag of agreementScore.flags) {
        uncertaintyFlags.push(flag);
    }

    // ── Factor 5: Symptom Specificity (10%) ──
    const specificityScore = calculateSymptomSpecificity(patientData.symptoms);
    factors.symptomSpecificity = {
        score: specificityScore,
        weight: 0.10,
        weighted: Math.round(specificityScore * 0.10),
    };
    if (specificityScore < 40) {
        uncertaintyFlags.push({
            type: 'VAGUE_SYMPTOMS',
            severity: 'MEDIUM',
            message: 'Symptoms are vague or non-specific, which limits triage accuracy.',
        });
    }

    // ── Factor 6: Semantic Match Quality (10%) ──
    const vectorScore = calculateVectorMatchQuality(graphResult, vectorResult);
    factors.semanticMatch = {
        score: vectorScore.score,
        weight: 0.10,
        weighted: Math.round(vectorScore.score * 0.10),
    };
    for (const flag of vectorScore.flags) {
        uncertaintyFlags.push(flag);
    }

    // ── Calculate total ──
    const totalScore = Math.round(
        factors.dataCompleteness.weighted +
        factors.graphMatchStrength.weighted +
        factors.vitalConsistency.weighted +
        factors.aiKbAgreement.weighted +
        factors.symptomSpecificity.weighted +
        factors.semanticMatch.weighted
    );

    // Clamp to 0-100
    const confidenceScore = Math.max(0, Math.min(100, totalScore));

    // Determine level
    let confidenceLevel;
    if (confidenceScore >= 75) confidenceLevel = 'HIGH';
    else if (confidenceScore >= 50) confidenceLevel = 'MEDIUM';
    else confidenceLevel = 'LOW';

    // ── Determine if human review is required ──
    const hasCriticalFlag = uncertaintyFlags.some((f) => f.severity === 'HIGH');
    const requiresHumanReview = confidenceScore < 60 || hasCriticalFlag;

    // Build review reasons
    const reviewReasons = [];
    if (confidenceScore < 60) reviewReasons.push(`Low confidence score (${confidenceScore}/100)`);
    if (hasCriticalFlag) reviewReasons.push('Critical uncertainty flag(s) detected');

    return {
        confidenceScore,
        confidenceLevel,
        factors,
        uncertaintyFlags,
        requiresHumanReview,
        reviewReasons,
        calibratedAt: new Date().toISOString(),
    };
};

// ─────────────────────────────────────────────
// FACTOR CALCULATORS
// ─────────────────────────────────────────────

/**
 * Factor 2: How strongly did symptoms match KB clusters?
 */
const calculateGraphMatchStrength = (graphResult) => {
    if (!graphResult || !graphResult.primaryMatches) return 0;

    const matches = graphResult.primaryMatches;
    if (matches.length === 0) return 10; // No matches at all — very low

    // Score based on:
    // - Number of matches (more = more context)
    // - Match count vs threshold (how far above threshold)
    // - Whether vital flags were triggered (corroborating evidence)
    let score = 0;

    // Having at least one match
    score += 30;

    // Multiple matches increase confidence
    score += Math.min(matches.length * 10, 30);

    // Match strength: how many symptoms matched vs threshold
    const bestMatch = matches[0];
    const strengthRatio = bestMatch.matchCount / (bestMatch.matchedSymptoms?.length || bestMatch.matchCount || 1);
    score += Math.min(Math.round(strengthRatio * 20), 20);

    // Vital flag corroboration
    const totalVitalFlags = matches.reduce((sum, m) => sum + (m.vitalFlagsTriggered?.length || 0), 0);
    if (totalVitalFlags > 0) score += 10;

    // Differentials found (graph traversal depth)
    if (graphResult.differentials?.length > 0) score += 10;

    return Math.min(score, 100);
};

/**
 * Factor 3: Do vitals support the urgency level?
 */
const calculateVitalConsistency = (aiResult, contextSummary) => {
    const flags = [];
    const vitalStatus = contextSummary.vitalStatus;

    // If no vitals recorded, we can't check consistency
    if (vitalStatus.summary === 'No vitals recorded') {
        return {
            score: 40, // Uncertain — can't confirm or deny
            flags: [{
                type: 'NO_VITALS',
                severity: 'MEDIUM',
                message: 'No patient vitals were recorded. Urgency assessment is based solely on symptoms and history.',
            }],
        };
    }

    const urgencyLevel = aiResult.urgency_level;
    const abnormalVitals = vitalStatus.flags.length;
    const stability = vitalStatus.vitalStability;

    // Check for inconsistency: HIGH urgency but all vitals normal
    if (urgencyLevel <= 2 && stability === 100 && abnormalVitals === 0) {
        flags.push({
            type: 'URGENCY_VITAL_MISMATCH',
            severity: 'HIGH',
            message: `AI assessed urgency as ${aiResult.urgency_label} but all recorded vitals are within normal ranges. This may warrant closer clinical review.`,
        });
        return { score: 35, flags };
    }

    // Check for inconsistency: LOW urgency but abnormal vitals
    if (urgencyLevel >= 4 && abnormalVitals >= 2) {
        flags.push({
            type: 'URGENCY_VITAL_MISMATCH',
            severity: 'HIGH',
            message: `AI assessed urgency as ${aiResult.urgency_label} but ${abnormalVitals} vital sign(s) are abnormal: ${vitalStatus.flags.join('; ')}. Consider re-evaluating urgency.`,
        });
        return { score: 30, flags };
    }

    // Moderate consistency
    if (urgencyLevel <= 2 && abnormalVitals >= 1) {
        return { score: 80, flags }; // High urgency + abnormal vitals = consistent
    }

    if (urgencyLevel >= 4 && stability >= 80) {
        return { score: 85, flags }; // Low urgency + stable vitals = consistent
    }

    // Default reasonable consistency
    return { score: 70, flags };
};

/**
 * Factor 4: Does Gemini's urgency agree with the graph's most critical cluster?
 */
const calculateAIKBAgreement = (aiResult, graphResult) => {
    const flags = [];

    if (!graphResult.primaryMatches || graphResult.primaryMatches.length === 0) {
        // No KB match to compare against — neutral
        return { score: 50, flags };
    }

    const aiUrgency = aiResult.urgency_level;
    const kbUrgency = graphResult.primaryMatches[0].urgency_level; // Most critical match
    const diff = Math.abs(aiUrgency - kbUrgency);

    if (diff === 0) {
        return { score: 100, flags }; // Perfect agreement
    }

    if (diff === 1) {
        return { score: 80, flags }; // Close agreement — acceptable clinical variation
    }

    if (diff === 2) {
        flags.push({
            type: 'AI_KB_DISAGREEMENT',
            severity: 'MEDIUM',
            message: `AI assessed urgency as ${aiResult.urgency_label} (${aiUrgency}) but knowledge base suggests ${URGENCY_MAP[kbUrgency] || kbUrgency} (${kbUrgency}). 2-level discrepancy.`,
        });
        return { score: 50, flags };
    }

    // 3+ level disagreement — significant
    flags.push({
        type: 'AI_KB_DISAGREEMENT',
        severity: 'HIGH',
        message: `Major disagreement: AI says ${aiResult.urgency_label} (${aiUrgency}) but KB says ${URGENCY_MAP[kbUrgency] || kbUrgency} (${kbUrgency}). ${diff}-level discrepancy requires clinician review.`,
    });
    return { score: 20, flags };
};

/**
 * Factor 5: How specific are the reported symptoms?
 */
const calculateSymptomSpecificity = (symptoms = []) => {
    if (symptoms.length === 0) return 20; // No symptoms = very low specificity

    const vagueTerms = ['pain', 'discomfort', 'not feeling well', 'unwell', 'sick', 'bad', 'ache', 'general'];
    const specificTerms = ['chest', 'crushing', 'sharp', 'radiating', 'palpitation', 'syncope', 'hemoptysis',
        'hematuria', 'dyspnea', 'blurred', 'numbness', 'tingling', 'swelling', 'rash'];

    let specificCount = 0;
    let vagueCount = 0;

    for (const s of symptoms) {
        const name = (typeof s === 'string' ? s : s.name || '').toLowerCase();
        if (specificTerms.some((t) => name.includes(t))) specificCount++;
        else if (vagueTerms.some((t) => name === t)) vagueCount++;
    }

    // Having severity and duration increases specificity
    const hasSeverity = symptoms.filter((s) => s.severity != null).length;
    const hasDuration = symptoms.filter((s) => s.duration).length;

    let score = 40; // Base
    score += Math.min(specificCount * 15, 30);
    score -= Math.min(vagueCount * 10, 20);
    score += Math.min((hasSeverity / symptoms.length) * 15, 15);
    score += Math.min((hasDuration / symptoms.length) * 15, 15);

    return Math.max(0, Math.min(100, score));
};

/**
 * Factor 6: Do vector search results corroborate the graph analysis?
 */
const calculateVectorMatchQuality = (graphResult, vectorResult) => {
    const flags = [];

    // If vector engine wasn't available, neutral
    if (!vectorResult || vectorResult.fallback || !vectorResult.matches) {
        return { score: 50, flags };
    }

    const vectorMatches = vectorResult.matches || [];
    const graphMatches = graphResult?.primaryMatches || [];

    // No vector matches at all
    if (vectorMatches.length === 0) {
        if (graphMatches.length === 0) {
            // Both systems found nothing — flag it
            flags.push({
                type: 'NO_RAG_MATCH',
                severity: 'HIGH',
                message: 'Neither the knowledge graph nor semantic search found relevant clinical matches. AI assessment relies on general medical knowledge only.',
            });
            return { score: 15, flags };
        }
        // Graph matched but vectors didn't — unusual but not critical
        return { score: 40, flags };
    }

    // Check corroboration: do vector top results overlap with graph matches?
    const graphClusterIds = new Set(graphMatches.map((m) => m.clusterId));
    const vectorClusterIds = vectorMatches.map((m) => m.clusterId);
    const overlap = vectorClusterIds.filter((id) => graphClusterIds.has(id)).length;

    const topSimilarity = vectorMatches[0]?.similarity || 0;

    let score = 40; // Base

    // Strong vector match
    if (topSimilarity > 0.7) score += 25;
    else if (topSimilarity > 0.5) score += 15;

    // Corroboration: vector and graph agree on clusters
    if (overlap > 0) {
        score += Math.min(overlap * 15, 30);
    } else if (graphMatches.length > 0 && vectorMatches.length > 0) {
        // Both found results but disagree — reduce but don't flag
        score -= 10;
    }

    // Vectors compensating for graph miss
    if (graphMatches.length === 0 && vectorMatches.length > 0 && topSimilarity > 0.5) {
        score += 10; // Vector found what graph couldn't
    }

    return { score: Math.max(0, Math.min(100, score)), flags };
};

module.exports = { calibrateConfidence };
