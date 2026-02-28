const Graph = require('graphology');
const { bfsFromNode } = require('graphology-traversal');
const { loadKnowledgeBase } = require('./triageEngine.service');

let clinicalGraph = null;

// ─────────────────────────────────────────────
// BUILD GRAPH — called once at server startup
// ─────────────────────────────────────────────

const buildGraph = () => {
    const kb = loadKnowledgeBase();
    const graph = new Graph({ multi: true, type: 'directed' });

    if (!kb.symptom_clusters || kb.symptom_clusters.length === 0) {
        console.warn('⚠️  No symptom clusters in KB — graph will be empty');
        clinicalGraph = graph;
        return graph;
    }

    // ── Step 1: Add cluster nodes ──
    for (const cluster of kb.symptom_clusters) {
        graph.addNode(cluster.id, {
            type: 'cluster',
            urgency_level: cluster.urgency_level,
            urgency_label: cluster.urgency_label,
            color: cluster.color,
            icd_10: cluster.icd_10_category,
            presentation: cluster.presentation_summary,
            clinical_context: cluster.clinical_context,
            next_actions: cluster.next_actions || [],
            contraindications: cluster.contraindications || [],
            clarifying_questions: cluster.clarifying_questions || [],
            match_threshold: cluster.match_threshold || 2,
            vital_flags: cluster.vital_flags || {},
            tags: cluster.tags || [],
        });
    }

    // ── Step 2: Add symptom nodes + SYMPTOM_OF edges ──
    for (const cluster of kb.symptom_clusters) {
        for (const tag of cluster.tags || []) {
            const symptomId = `symptom:${tag}`;
            if (!graph.hasNode(symptomId)) {
                graph.addNode(symptomId, {
                    type: 'symptom',
                    label: tag.replace(/_/g, ' '),
                });
            }
            graph.addEdge(symptomId, cluster.id, {
                type: 'SYMPTOM_OF',
                weight: 1,
            });
        }
    }

    // ── Step 3: Add risk amplifier nodes + AMPLIFIES_RISK edges ──
    for (const cluster of kb.symptom_clusters) {
        for (const risk of cluster.risk_amplifiers || []) {
            const riskId = `risk:${risk}`;
            if (!graph.hasNode(riskId)) {
                graph.addNode(riskId, {
                    type: 'risk_factor',
                    label: risk.replace(/_/g, ' '),
                });
            }
            graph.addEdge(riskId, cluster.id, {
                type: 'AMPLIFIES_RISK',
                weight: 1,
            });
        }
    }

    // ── Step 4: Add DIFFERENTIAL_OF edges ──
    for (const cluster of kb.symptom_clusters) {
        for (const diffId of cluster.differential_diagnoses || []) {
            if (graph.hasNode(diffId)) {
                graph.addEdge(cluster.id, diffId, {
                    type: 'DIFFERENTIAL_OF',
                    weight: 1,
                });
            }
        }
    }

    // ── Step 5: Auto-generate SHARES_SYMPTOM edges ──
    const clusters = kb.symptom_clusters;
    for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
            const tagsA = new Set(clusters[i].tags || []);
            const tagsB = new Set(clusters[j].tags || []);
            const shared = [...tagsA].filter((t) => tagsB.has(t));

            if (shared.length >= 2) {
                graph.addEdge(clusters[i].id, clusters[j].id, {
                    type: 'SHARES_SYMPTOM',
                    shared_symptoms: shared,
                    weight: shared.length,
                });
                graph.addEdge(clusters[j].id, clusters[i].id, {
                    type: 'SHARES_SYMPTOM',
                    shared_symptoms: shared,
                    weight: shared.length,
                });
            }
        }
    }

    clinicalGraph = graph;

    const stats = getGraphStats();
    console.log(`🔗 Clinical Knowledge Graph built:`);
    console.log(`   ${stats.nodes.total} nodes (${stats.nodes.clusters} clusters, ${stats.nodes.symptoms} symptoms, ${stats.nodes.risks} risk factors)`);
    console.log(`   ${stats.edges.total} edges (${stats.edges.symptom_of} SYMPTOM_OF, ${stats.edges.differential_of} DIFFERENTIAL_OF, ${stats.edges.amplifies_risk} AMPLIFIES_RISK, ${stats.edges.shares_symptom} SHARES_SYMPTOM)`);

    return graph;
};

// ─────────────────────────────────────────────
// QUERY GRAPH — main function for AI pipeline
// ─────────────────────────────────────────────

const queryGraph = (symptoms, vitals = {}, medicalHistory = {}) => {
    if (!clinicalGraph) buildGraph();

    const symptomNames = symptoms.map((s) =>
        typeof s === 'string' ? s.toLowerCase() : (s.name || '').toLowerCase()
    );

    // ── Step 1: Find primary cluster matches (same as flat lookup but via graph) ──
    const clusterScores = {};

    for (const symptomName of symptomNames) {
        // Find all symptom nodes that fuzzy-match the input
        clinicalGraph.forEachNode((nodeId, attrs) => {
            if (attrs.type !== 'symptom') return;

            const tag = attrs.label;
            if (
                symptomName.includes(tag) ||
                tag.includes(symptomName) ||
                symptomName.includes(nodeId.replace('symptom:', '').replace(/_/g, ' ')) ||
                nodeId.replace('symptom:', '').replace(/_/g, ' ').includes(symptomName)
            ) {
                // Traverse SYMPTOM_OF edges to find connected clusters
                clinicalGraph.forEachOutEdge(nodeId, (edge, edgeAttrs, source, target) => {
                    if (edgeAttrs.type === 'SYMPTOM_OF') {
                        if (!clusterScores[target]) {
                            clusterScores[target] = {
                                matchedSymptoms: [],
                                score: 0,
                            };
                        }
                        if (!clusterScores[target].matchedSymptoms.includes(tag)) {
                            clusterScores[target].matchedSymptoms.push(tag);
                            clusterScores[target].score++;
                        }
                    }
                });
            }
        });
    }

    // Filter by match_threshold
    const primaryMatches = [];
    for (const [clusterId, data] of Object.entries(clusterScores)) {
        const attrs = clinicalGraph.getNodeAttributes(clusterId);
        if (data.score >= (attrs.match_threshold || 2)) {
            // Check vital flags
            const vitalFlags = checkVitalFlags(attrs.vital_flags, vitals);

            primaryMatches.push({
                clusterId,
                urgency_level: attrs.urgency_level,
                urgency_label: attrs.urgency_label,
                clinical_context: attrs.clinical_context,
                next_actions: attrs.next_actions,
                contraindications: attrs.contraindications,
                clarifying_questions: attrs.clarifying_questions,
                matchedSymptoms: data.matchedSymptoms,
                matchCount: data.score,
                vitalFlagsTriggered: vitalFlags,
                source: 'primary',
            });
        }
    }

    // Sort by urgency (lower = more critical)
    primaryMatches.sort((a, b) => a.urgency_level - b.urgency_level);

    // ── Step 2: Traverse DIFFERENTIAL_OF edges from matched clusters ──
    const differentials = [];
    const seenDifferentials = new Set(primaryMatches.map((m) => m.clusterId));

    for (const match of primaryMatches) {
        clinicalGraph.forEachOutEdge(match.clusterId, (edge, edgeAttrs, source, target) => {
            if (edgeAttrs.type === 'DIFFERENTIAL_OF' && !seenDifferentials.has(target)) {
                seenDifferentials.add(target);
                const targetAttrs = clinicalGraph.getNodeAttributes(target);
                differentials.push({
                    clusterId: target,
                    urgency_level: targetAttrs.urgency_level,
                    urgency_label: targetAttrs.urgency_label,
                    clinical_context: targetAttrs.clinical_context,
                    linkedFrom: match.clusterId,
                    source: 'differential',
                });
            }
        });
    }

    differentials.sort((a, b) => a.urgency_level - b.urgency_level);

    // ── Step 3: Check risk amplifiers from patient history ──
    const riskMatches = [];
    const patientConditions = [
        ...(medicalHistory.conditions || []),
        ...(medicalHistory.medications || []),
    ].map((c) => c.toLowerCase().replace(/\s+/g, '_'));

    for (const condition of patientConditions) {
        const riskId = `risk:${condition}`;
        if (clinicalGraph.hasNode(riskId)) {
            clinicalGraph.forEachOutEdge(riskId, (edge, edgeAttrs, source, target) => {
                if (edgeAttrs.type === 'AMPLIFIES_RISK') {
                    const targetAttrs = clinicalGraph.getNodeAttributes(target);
                    riskMatches.push({
                        riskFactor: condition.replace(/_/g, ' '),
                        amplifiedCluster: target,
                        urgency_level: targetAttrs.urgency_level,
                        urgency_label: targetAttrs.urgency_label,
                    });
                }
            });
        }
    }

    // ── Step 4: Find shared-symptom clusters (1-hop SHARES_SYMPTOM) ──
    const sharedClusters = [];
    const seenShared = new Set(seenDifferentials);

    for (const match of primaryMatches) {
        clinicalGraph.forEachOutEdge(match.clusterId, (edge, edgeAttrs, source, target) => {
            if (edgeAttrs.type === 'SHARES_SYMPTOM' && !seenShared.has(target)) {
                seenShared.add(target);
                const targetAttrs = clinicalGraph.getNodeAttributes(target);
                sharedClusters.push({
                    clusterId: target,
                    urgency_level: targetAttrs.urgency_level,
                    urgency_label: targetAttrs.urgency_label,
                    sharedSymptoms: edgeAttrs.shared_symptoms,
                    linkedFrom: match.clusterId,
                    source: 'shared_symptom',
                });
            }
        });
    }

    // ── Step 5: Aggregate clarifying questions ──
    const clarifyingQuestions = [];
    const seenQuestions = new Set();

    for (const match of primaryMatches) {
        for (const q of match.clarifying_questions || []) {
            if (!seenQuestions.has(q)) {
                seenQuestions.add(q);
                clarifyingQuestions.push({ question: q, fromCluster: match.clusterId });
            }
        }
    }
    // Also include questions from top differential
    for (const diff of differentials.slice(0, 2)) {
        const diffAttrs = clinicalGraph.getNodeAttributes(diff.clusterId);
        for (const q of diffAttrs.clarifying_questions || []) {
            if (!seenQuestions.has(q)) {
                seenQuestions.add(q);
                clarifyingQuestions.push({ question: q, fromCluster: diff.clusterId });
            }
        }
    }

    return {
        primaryMatches,
        differentials,
        riskMatches,
        sharedClusters,
        clarifyingQuestions,
        graphTraversal: {
            primaryCount: primaryMatches.length,
            differentialCount: differentials.length,
            riskAmplifierCount: riskMatches.length,
            sharedClusterCount: sharedClusters.length,
            clarifyingQuestionCount: clarifyingQuestions.length,
        },
    };
};

// ─────────────────────────────────────────────
// VITAL FLAG CHECKER
// ─────────────────────────────────────────────

const checkVitalFlags = (flags, vitals) => {
    if (!flags || !vitals) return [];
    const triggered = [];

    if (flags.bp_systolic_gt && vitals.bp_systolic > flags.bp_systolic_gt)
        triggered.push(`BP systolic ${vitals.bp_systolic} > ${flags.bp_systolic_gt} mmHg`);
    if (flags.bp_systolic_lt && vitals.bp_systolic < flags.bp_systolic_lt)
        triggered.push(`BP systolic ${vitals.bp_systolic} < ${flags.bp_systolic_lt} mmHg (hypotension)`);
    if (flags.bp_diastolic_gt && vitals.bp_diastolic > flags.bp_diastolic_gt)
        triggered.push(`BP diastolic ${vitals.bp_diastolic} > ${flags.bp_diastolic_gt} mmHg`);
    if (flags.hr_gt && vitals.heart_rate > flags.hr_gt)
        triggered.push(`HR ${vitals.heart_rate} > ${flags.hr_gt} bpm (tachycardia)`);
    if (flags.hr_lt && vitals.heart_rate < flags.hr_lt)
        triggered.push(`HR ${vitals.heart_rate} < ${flags.hr_lt} bpm (bradycardia)`);
    if (flags.spo2_lt && vitals.spo2 < flags.spo2_lt)
        triggered.push(`SpO2 ${vitals.spo2}% < ${flags.spo2_lt}% (hypoxia)`);
    if (flags.rr_gt && vitals.respiratory_rate > flags.rr_gt)
        triggered.push(`RR ${vitals.respiratory_rate} > ${flags.rr_gt}/min (tachypnoea)`);
    if (flags.temp_gt && vitals.temperature > flags.temp_gt)
        triggered.push(`Temp ${vitals.temperature}°C > ${flags.temp_gt}°C (fever)`);

    return triggered;
};

// ─────────────────────────────────────────────
// GRAPH UTILITIES
// ─────────────────────────────────────────────

const getGraphStats = () => {
    if (!clinicalGraph) return { nodes: {}, edges: {} };

    let clusters = 0, symptoms = 0, risks = 0;
    clinicalGraph.forEachNode((id, attrs) => {
        if (attrs.type === 'cluster') clusters++;
        else if (attrs.type === 'symptom') symptoms++;
        else if (attrs.type === 'risk_factor') risks++;
    });

    let symptom_of = 0, differential_of = 0, amplifies_risk = 0, shares_symptom = 0;
    clinicalGraph.forEachEdge((id, attrs) => {
        if (attrs.type === 'SYMPTOM_OF') symptom_of++;
        else if (attrs.type === 'DIFFERENTIAL_OF') differential_of++;
        else if (attrs.type === 'AMPLIFIES_RISK') amplifies_risk++;
        else if (attrs.type === 'SHARES_SYMPTOM') shares_symptom++;
    });

    return {
        nodes: { total: clinicalGraph.order, clusters, symptoms, risks },
        edges: { total: clinicalGraph.size, symptom_of, differential_of, amplifies_risk, shares_symptom },
    };
};

const exportGraphForVisualization = () => {
    if (!clinicalGraph) return { nodes: [], edges: [] };

    const nodes = [];
    clinicalGraph.forEachNode((id, attrs) => {
        nodes.push({
            id,
            label: attrs.label || id.replace(/_/g, ' '),
            type: attrs.type,
            urgency_level: attrs.urgency_level || null,
            urgency_label: attrs.urgency_label || null,
            color: attrs.color || (attrs.type === 'symptom' ? '#8B5CF6' : attrs.type === 'risk_factor' ? '#F59E0B' : '#6B7280'),
        });
    });

    const edges = [];
    clinicalGraph.forEachEdge((id, attrs, source, target) => {
        edges.push({
            id,
            source,
            target,
            type: attrs.type,
            weight: attrs.weight || 1,
            shared_symptoms: attrs.shared_symptoms || null,
        });
    });

    return { nodes, edges, stats: getGraphStats() };
};

const getClusterNeighbors = (clusterId) => {
    if (!clinicalGraph || !clinicalGraph.hasNode(clusterId)) return null;

    const attrs = clinicalGraph.getNodeAttributes(clusterId);
    const symptoms = [], differentials = [], riskFactors = [], sharedWith = [];

    clinicalGraph.forEachInEdge(clusterId, (edge, edgeAttrs, source) => {
        const sourceAttrs = clinicalGraph.getNodeAttributes(source);
        if (edgeAttrs.type === 'SYMPTOM_OF')
            symptoms.push(sourceAttrs.label);
        else if (edgeAttrs.type === 'AMPLIFIES_RISK')
            riskFactors.push(sourceAttrs.label);
    });

    clinicalGraph.forEachOutEdge(clusterId, (edge, edgeAttrs, source, target) => {
        if (edgeAttrs.type === 'DIFFERENTIAL_OF')
            differentials.push(target);
        else if (edgeAttrs.type === 'SHARES_SYMPTOM')
            sharedWith.push({ cluster: target, shared: edgeAttrs.shared_symptoms });
    });

    return {
        clusterId,
        urgency_level: attrs.urgency_level,
        urgency_label: attrs.urgency_label,
        clinical_context: attrs.clinical_context,
        symptoms,
        differentials,
        riskFactors,
        sharedWith,
        contraindications: attrs.contraindications,
        clarifying_questions: attrs.clarifying_questions,
    };
};

/**
 * Return all symptom tags available in the graph.
 */
const getAvailableSymptomTags = () => {
    if (!clinicalGraph) buildGraph();
    const tags = [];
    clinicalGraph.forEachNode((id, attrs) => {
        if (attrs.type === 'symptom') tags.push(attrs.label);
    });
    return tags;
};

/**
 * Export graph enriched with patient-specific highlights for clinician visualization.
 * @param {{ symptoms: Array, vitals: object, medicalHistory: object }} sessionData
 * @returns {{ graph: { nodes: Array, edges: Array }, queryResult: object }}
 */
const exportPatientGraph = (sessionData) => {
    if (!clinicalGraph) buildGraph();

    const { symptoms = [], vitals = {}, medicalHistory = {} } = sessionData;
    const qr = queryGraph(symptoms, vitals, medicalHistory);

    // Build sets for O(1) lookup
    const primaryClusterIds = new Set(qr.primaryMatches.map((m) => m.clusterId));
    const differentialIds = new Set(qr.differentials.map((d) => d.clusterId));
    const sharedClusterIds = new Set(qr.sharedClusters.map((s) => s.clusterId));

    const matchedSymptomLabels = new Set();
    for (const m of qr.primaryMatches) {
        for (const s of m.matchedSymptoms || []) matchedSymptomLabels.add(s);
    }

    const riskFactorNames = new Set(
        qr.riskMatches.map((r) => r.riskFactor.replace(/\s+/g, '_'))
    );

    // ── Build enriched nodes ──
    const nodes = [];
    clinicalGraph.forEachNode((id, attrs) => {
        let highlighted = false;
        let highlightType = null;
        let highlightReason = null;

        if (attrs.type === 'cluster') {
            if (primaryClusterIds.has(id)) {
                highlighted = true;
                highlightType = 'primary_match';
                const m = qr.primaryMatches.find((x) => x.clusterId === id);
                highlightReason = `Primary match — ${m.matchCount} symptoms matched (${m.matchedSymptoms.join(', ')})`;
            } else if (differentialIds.has(id)) {
                highlighted = true;
                highlightType = 'differential';
                const d = qr.differentials.find((x) => x.clusterId === id);
                highlightReason = `Differential diagnosis linked from ${d.linkedFrom}`;
            } else if (sharedClusterIds.has(id)) {
                highlighted = true;
                highlightType = 'shared_symptom';
                const s = qr.sharedClusters.find((x) => x.clusterId === id);
                highlightReason = `Shares symptoms (${s.sharedSymptoms.join(', ')}) with ${s.linkedFrom}`;
            }
        } else if (attrs.type === 'symptom') {
            const tag = attrs.label;
            if (matchedSymptomLabels.has(tag)) {
                highlighted = true;
                highlightType = 'matched_symptom';
                highlightReason = `Patient-reported symptom`;
            }
        } else if (attrs.type === 'risk_factor') {
            const riskName = id.replace('risk:', '');
            if (riskFactorNames.has(riskName)) {
                highlighted = true;
                highlightType = 'risk_amplifier';
                const rm = qr.riskMatches.find(
                    (r) => r.riskFactor.replace(/\s+/g, '_') === riskName
                );
                highlightReason = rm
                    ? `Patient risk factor — amplifies ${rm.amplifiedCluster}`
                    : 'Patient risk factor from medical history';
            }
        }

        // Determine display color
        let color;
        if (attrs.type === 'cluster') {
            const colorMap = { red: '#EF4444', orange: '#F97316', yellow: '#EAB308', green: '#22C55E', blue: '#3B82F6' };
            color = colorMap[attrs.color] || '#6B7280';
        } else if (attrs.type === 'symptom') {
            color = '#8B5CF6';
        } else {
            color = '#F59E0B';
        }

        nodes.push({
            id,
            label: attrs.label || id.replace(/_/g, ' '),
            type: attrs.type,
            urgency_level: attrs.urgency_level || null,
            urgency_label: attrs.urgency_label || null,
            color,
            presentation: attrs.presentation || null,
            clinical_context: attrs.clinical_context || null,
            next_actions: attrs.next_actions || null,
            contraindications: attrs.contraindications || null,
            highlighted,
            highlightType,
            highlightReason,
        });
    });

    // ── Build enriched edges ──
    const allHighlightedNodeIds = new Set(
        nodes.filter((n) => n.highlighted).map((n) => n.id)
    );

    const edges = [];
    clinicalGraph.forEachEdge((id, attrs, source, target) => {
        const edgeHighlighted =
            allHighlightedNodeIds.has(source) && allHighlightedNodeIds.has(target);

        edges.push({
            id,
            source,
            target,
            type: attrs.type,
            weight: attrs.weight || 1,
            shared_symptoms: attrs.shared_symptoms || null,
            highlighted: edgeHighlighted,
        });
    });

    return {
        graph: { nodes, edges, stats: getGraphStats() },
        queryResult: {
            primaryMatches: qr.primaryMatches,
            differentials: qr.differentials,
            riskMatches: qr.riskMatches,
            sharedClusters: qr.sharedClusters,
            clarifyingQuestions: qr.clarifyingQuestions,
            traversal: qr.graphTraversal,
        },
    };
};

module.exports = {
    buildGraph,
    queryGraph,
    getGraphStats,
    exportGraphForVisualization,
    getClusterNeighbors,
    exportPatientGraph,
    getAvailableSymptomTags,
};
