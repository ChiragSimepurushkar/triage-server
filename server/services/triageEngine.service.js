const fs = require('fs');
const path = require('path');

let knowledgeBase = null;

/**
 * Load the clinical knowledge base JSON file
 */
const loadKnowledgeBase = () => {
    if (knowledgeBase) return knowledgeBase;

    const kbPath = path.join(__dirname, '..', 'knowledge', 'clinicalKnowledgeBase.json');

    try {
        if (fs.existsSync(kbPath)) {
            const data = fs.readFileSync(kbPath, 'utf-8');
            knowledgeBase = JSON.parse(data);
            console.log(
                `📚 Clinical Knowledge Base loaded: ${knowledgeBase.symptom_clusters?.length || 0} clusters`
            );
        } else {
            console.warn('⚠️ Clinical Knowledge Base not found — AI will work without KB context');
            knowledgeBase = { symptom_clusters: [] };
        }
    } catch (error) {
        console.error('❌ Error loading Clinical Knowledge Base:', error.message);
        knowledgeBase = { symptom_clusters: [] };
    }

    return knowledgeBase;
};

/**
 * Look up matching symptom clusters from the knowledge base
 * @param {string[]} symptoms - Array of symptom names
 * @param {object} vitals - Patient vitals object
 * @returns {object[]} Matching clusters with relevance info
 */
const lookupClinicalContext = (symptoms, vitals = {}) => {
    const kb = loadKnowledgeBase();

    if (!kb.symptom_clusters || kb.symptom_clusters.length === 0) {
        return [];
    }

    const symptomNames = symptoms.map((s) =>
        typeof s === 'string' ? s.toLowerCase() : (s.name || '').toLowerCase()
    );

    const matches = [];

    for (const cluster of kb.symptom_clusters) {
        // Count how many symptom tags match
        const matchingTags = cluster.tags.filter((tag) =>
            symptomNames.some(
                (symptom) =>
                    symptom.includes(tag.replace(/_/g, ' ')) ||
                    tag.replace(/_/g, ' ').includes(symptom) ||
                    symptom.includes(tag) ||
                    tag.includes(symptom)
            )
        );

        const matchCount = matchingTags.length;

        if (matchCount >= (cluster.match_threshold || 2)) {
            // Check vital flags for additional urgency
            let vitalFlagsTriggered = [];
            if (cluster.vital_flags && vitals) {
                if (cluster.vital_flags.bp_systolic_gt && vitals.bp_systolic > cluster.vital_flags.bp_systolic_gt) {
                    vitalFlagsTriggered.push(`BP systolic ${vitals.bp_systolic} > ${cluster.vital_flags.bp_systolic_gt}`);
                }
                if (cluster.vital_flags.spo2_lt && vitals.spo2 < cluster.vital_flags.spo2_lt) {
                    vitalFlagsTriggered.push(`SpO2 ${vitals.spo2}% < ${cluster.vital_flags.spo2_lt}%`);
                }
                if (cluster.vital_flags.hr_gt && vitals.heart_rate > cluster.vital_flags.hr_gt) {
                    vitalFlagsTriggered.push(`HR ${vitals.heart_rate} > ${cluster.vital_flags.hr_gt}`);
                }
                if (cluster.vital_flags.rr_gt && vitals.respiratory_rate > cluster.vital_flags.rr_gt) {
                    vitalFlagsTriggered.push(`RR ${vitals.respiratory_rate} > ${cluster.vital_flags.rr_gt}`);
                }
            }

            matches.push({
                clusterId: cluster.id,
                urgency_level: cluster.urgency_level,
                urgency_label: cluster.urgency_label,
                clinical_context: cluster.clinical_context,
                next_actions: cluster.next_actions,
                matchingTags,
                matchCount,
                vitalFlagsTriggered,
                risk_amplifiers: cluster.risk_amplifiers,
            });
        }
    }

    // Sort by urgency level (lower = more critical)
    matches.sort((a, b) => a.urgency_level - b.urgency_level);

    return matches;
};

/**
 * Build the full triage prompt for Gemini
 * @param {object} patientData - Patient symptoms, vitals, history
 * @param {object[]} clinicalMatches - Matched KB clusters
 * @returns {string} Complete prompt
 */
const buildTriagePrompt = (patientData, clinicalMatches) => {
    let clinicalContext = 'No specific clinical context matched from knowledge base.';

    if (clinicalMatches.length > 0) {
        clinicalContext = clinicalMatches
            .map(
                (match) =>
                    `[${match.urgency_label}] ${match.clusterId}: ${match.clinical_context}\n` +
                    `  Matching symptoms: ${match.matchingTags.join(', ')}\n` +
                    `  Suggested actions: ${match.next_actions.join('; ')}\n` +
                    (match.vitalFlagsTriggered.length > 0
                        ? `  Vital flags triggered: ${match.vitalFlagsTriggered.join('; ')}\n`
                        : '') +
                    (match.risk_amplifiers
                        ? `  Risk amplifiers to check: ${match.risk_amplifiers.join(', ')}`
                        : '')
            )
            .join('\n\n');
    }

    const symptomsStr = patientData.symptoms
        ? patientData.symptoms
            .map((s) => (typeof s === 'string' ? s : `${s.name} (severity: ${s.severity || 'N/A'}, duration: ${s.duration || 'N/A'})`))
            .join(', ')
        : 'Not provided';

    const bp = patientData.vitals
        ? `${patientData.vitals.bp_systolic || '?'}/${patientData.vitals.bp_diastolic || '?'}`
        : 'N/A';

    return `
You are a clinical triage decision support system. Your role is to assist clinicians — NOT to diagnose patients.

PATIENT DATA:
- Age: ${patientData.age || 'Unknown'}, Gender: ${patientData.gender || 'Unknown'}
- Chief Complaint: ${patientData.chiefComplaint || 'Not provided'}
- Reported Symptoms: ${symptomsStr}
- Vitals: BP ${bp}, HR ${patientData.vitals?.heart_rate || '?'}bpm, SpO2 ${patientData.vitals?.spo2 || '?'}%, Temp ${patientData.vitals?.temperature || '?'}°C, RR ${patientData.vitals?.respiratory_rate || '?'}/min
- Medical History: ${patientData.medicalHistory?.conditions?.join(', ') || 'None reported'}
- Current Medications: ${patientData.medicalHistory?.medications?.join(', ') || 'None'}
- Allergies: ${patientData.medicalHistory?.allergies || 'None known'}

CLINICAL KNOWLEDGE BASE CONTEXT:
${clinicalContext}

Based on the above patient data and clinical context, provide a structured triage assessment.
Do NOT provide a diagnosis. Only assess urgency and recommend next steps for the clinician.

Respond in this exact JSON format:
{
  "urgency_level": <1-5>,
  "urgency_label": "<CRITICAL|URGENT|MODERATE|LOW|OBSERVATION>",
  "primary_concern": "<brief clinical concern in one sentence>",
  "reasoning": "<2-3 sentence clinical reasoning for urgency level, referencing specific symptoms and vitals>",
  "recommended_actions": ["<action 1>", "<action 2>", "<action 3>"],
  "vital_flags": ["<any abnormal vitals noted>"],
  "clinician_notes": "<additional context for the reviewing clinician>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "disclaimer": "This is AI-assisted triage support only. Clinical judgment of the reviewing clinician supersedes this recommendation."
}
`.trim();
};

module.exports = { loadKnowledgeBase, lookupClinicalContext, buildTriagePrompt };
