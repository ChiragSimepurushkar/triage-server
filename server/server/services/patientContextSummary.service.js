/**
 * Patient Context Summary Service
 *
 * Generates a structured patient snapshot before the AI prompt is built.
 * This summary feeds into Gemini AND is saved to the session for clinicians.
 */

// ── Clinical vital reference ranges ──
const VITAL_RANGES = {
    bp_systolic: { low: [0, 90], normal: [90, 140], borderline: [140, 160], abnormal: [160, Infinity], unit: 'mmHg', label: 'BP Systolic' },
    bp_diastolic: { low: [0, 60], normal: [60, 90], borderline: [90, 100], abnormal: [100, Infinity], unit: 'mmHg', label: 'BP Diastolic' },
    heart_rate: { low: [0, 60], normal: [60, 100], borderline: [100, 120], abnormal: [120, Infinity], unit: 'bpm', label: 'Heart Rate' },
    spo2: { abnormal: [0, 90], borderline: [90, 95], normal: [95, 101], unit: '%', label: 'SpO₂' },
    temperature: { low: [0, 36], normal: [36, 37.5], borderline: [37.5, 38.5], abnormal: [38.5, Infinity], unit: '°C', label: 'Temperature' },
    respiratory_rate: { low: [0, 12], normal: [12, 20], borderline: [20, 25], abnormal: [25, Infinity], unit: '/min', label: 'Respiratory Rate' },
};

/**
 * Classify a vital value into a status category
 */
const classifyVital = (key, value) => {
    if (value == null || isNaN(value)) return { status: 'MISSING', value: null };

    const range = VITAL_RANGES[key];
    if (!range) return { status: 'UNKNOWN', value };

    // SpO₂ is inverted (lower = worse)
    if (key === 'spo2') {
        if (value < range.abnormal[1]) return { status: 'ABNORMAL', value, label: range.label, unit: range.unit, flag: `${range.label} critically low at ${value}${range.unit}` };
        if (value < range.borderline[1]) return { status: 'BORDERLINE', value, label: range.label, unit: range.unit, flag: `${range.label} low at ${value}${range.unit}` };
        return { status: 'NORMAL', value, label: range.label, unit: range.unit };
    }

    // Check low range
    if (range.low && value < range.low[1]) return { status: 'ABNORMAL', value, label: range.label, unit: range.unit, flag: `${range.label} critically low at ${value}${range.unit}` };
    if (value >= range.abnormal[0]) return { status: 'ABNORMAL', value, label: range.label, unit: range.unit, flag: `${range.label} dangerously high at ${value}${range.unit}` };
    if (value >= range.borderline[0]) return { status: 'BORDERLINE', value, label: range.label, unit: range.unit, flag: `${range.label} elevated at ${value}${range.unit}` };
    return { status: 'NORMAL', value, label: range.label, unit: range.unit };
};

/**
 * Build a full patient context summary
 * @param {object} patientData - { age, gender, chiefComplaint, symptoms, vitals, medicalHistory }
 * @param {object} graphResult - result from queryGraph()
 * @returns {object} Structured patient context summary
 */
const buildPatientContextSummary = (patientData, graphResult) => {
    // ── 1. Patient snapshot ──
    const snapshot = buildSnapshot(patientData);

    // ── 2. Symptom profile ──
    const symptomProfile = buildSymptomProfile(patientData.symptoms);

    // ── 3. Vital status ──
    const vitalStatus = buildVitalStatus(patientData.vitals);

    // ── 4. Risk profile ──
    const riskProfile = buildRiskProfile(patientData.medicalHistory, graphResult);

    // ── 5. Data gaps ──
    const dataGaps = identifyDataGaps(patientData);

    // ── 6. Data completeness score (0-100) ──
    const completenessScore = calculateCompleteness(patientData);

    return {
        snapshot,
        symptomProfile,
        vitalStatus,
        riskProfile,
        dataGaps,
        completenessScore,
        generatedAt: new Date().toISOString(),
    };
};

/**
 * One-line patient snapshot
 */
const buildSnapshot = (data) => {
    const age = data.age ? `${data.age}yo` : 'Unknown age';
    const gender = data.gender || 'Unknown gender';
    const complaint = data.chiefComplaint || 'No chief complaint';
    return `${age} ${gender} presenting with: ${complaint}`;
};

/**
 * Group symptoms by body area, sorted by severity
 */
const buildSymptomProfile = (symptoms = []) => {
    if (symptoms.length === 0) return { count: 0, byArea: {}, highSeverity: [], summary: 'No symptoms reported' };

    const byArea = {};
    const highSeverity = [];

    for (const s of symptoms) {
        const area = s.bodyArea || 'General';
        if (!byArea[area]) byArea[area] = [];
        byArea[area].push({
            name: s.name,
            severity: s.severity || 5,
            duration: s.duration || 'Not specified',
        });

        if ((s.severity || 5) >= 7) {
            highSeverity.push(`${s.name} (severity ${s.severity}/10)`);
        }
    }

    // Sort each area by severity (descending)
    for (const area of Object.keys(byArea)) {
        byArea[area].sort((a, b) => b.severity - a.severity);
    }

    const avgSeverity = (symptoms.reduce((sum, s) => sum + (s.severity || 5), 0) / symptoms.length).toFixed(1);

    return {
        count: symptoms.length,
        averageSeverity: parseFloat(avgSeverity),
        highSeverity,
        byArea,
        summary: `${symptoms.length} symptom(s), avg severity ${avgSeverity}/10${highSeverity.length > 0 ? `. HIGH SEVERITY: ${highSeverity.join(', ')}` : ''}`,
    };
};

/**
 * Classify each vital as NORMAL/BORDERLINE/ABNORMAL/MISSING
 */
const buildVitalStatus = (vitals = {}) => {
    const results = {};
    const flags = [];
    let normalCount = 0;
    let totalChecked = 0;

    for (const [key, range] of Object.entries(VITAL_RANGES)) {
        const value = vitals[key];
        const result = classifyVital(key, value);
        results[key] = result;

        if (result.status !== 'MISSING') {
            totalChecked++;
            if (result.status === 'NORMAL') normalCount++;
            if (result.flag) flags.push(result.flag);
        }
    }

    const vitalStability = totalChecked > 0 ? Math.round((normalCount / totalChecked) * 100) : 0;

    return {
        results,
        flags,
        vitalStability,
        summary: totalChecked === 0
            ? 'No vitals recorded'
            : `${totalChecked} vitals checked, ${normalCount} normal, ${flags.length} flagged. Stability: ${vitalStability}%`,
    };
};

/**
 * Identify risk amplifiers from patient history matched against graph
 */
const buildRiskProfile = (medicalHistory = {}, graphResult = {}) => {
    const conditions = medicalHistory.conditions || [];
    const medications = medicalHistory.medications || [];
    const allergies = medicalHistory.allergies || 'None known';

    const graphRisks = (graphResult.riskMatches || []).map((r) => ({
        factor: r.riskFactor,
        amplifies: r.amplifiedCluster,
        urgency: r.urgency_label,
    }));

    return {
        conditions,
        medications,
        allergies,
        graphMatchedRisks: graphRisks,
        hasSignificantHistory: conditions.length > 0 || medications.length > 0,
        summary: graphRisks.length > 0
            ? `${conditions.length} conditions, ${medications.length} medications. ${graphRisks.length} risk amplifier(s) matched in knowledge graph.`
            : `${conditions.length} conditions, ${medications.length} medications. No specific risk amplifiers matched.`,
    };
};

/**
 * Explicitly identify missing data
 */
const identifyDataGaps = (data) => {
    const gaps = [];

    if (!data.age) gaps.push('Patient age not recorded');
    if (!data.gender) gaps.push('Patient gender not recorded');
    if (!data.chiefComplaint) gaps.push('No chief complaint provided');
    if (!data.symptoms || data.symptoms.length === 0) gaps.push('No symptoms reported');

    // Vital gaps
    const vitals = data.vitals || {};
    if (vitals.bp_systolic == null) gaps.push('Blood pressure not recorded');
    if (vitals.heart_rate == null) gaps.push('Heart rate not recorded');
    if (vitals.spo2 == null) gaps.push('Oxygen saturation not recorded');
    if (vitals.temperature == null) gaps.push('Temperature not recorded');
    if (vitals.respiratory_rate == null) gaps.push('Respiratory rate not recorded');

    // History gaps
    const history = data.medicalHistory || {};
    if (!history.conditions || history.conditions.length === 0) gaps.push('No medical history conditions listed');
    if (!history.medications || history.medications.length === 0) gaps.push('No current medications listed');

    return gaps;
};

/**
 * Calculate a data completeness score (0-100)
 */
const calculateCompleteness = (data) => {
    let score = 0;
    const weights = {
        age: 8,
        gender: 5,
        chiefComplaint: 10,
        symptoms: 15,         // having 1+ symptom
        symptomSeverity: 7,   // having severity on symptoms
        bp: 10,
        heartRate: 10,
        spo2: 10,
        temperature: 8,
        respiratoryRate: 7,
        conditions: 5,
        medications: 5,
    };

    if (data.age) score += weights.age;
    if (data.gender) score += weights.gender;
    if (data.chiefComplaint) score += weights.chiefComplaint;
    if (data.symptoms?.length > 0) {
        score += weights.symptoms;
        if (data.symptoms.every((s) => s.severity != null)) score += weights.symptomSeverity;
    }
    if (data.vitals?.bp_systolic != null) score += weights.bp;
    if (data.vitals?.heart_rate != null) score += weights.heartRate;
    if (data.vitals?.spo2 != null) score += weights.spo2;
    if (data.vitals?.temperature != null) score += weights.temperature;
    if (data.vitals?.respiratory_rate != null) score += weights.respiratoryRate;
    if (data.medicalHistory?.conditions?.length > 0) score += weights.conditions;
    if (data.medicalHistory?.medications?.length > 0) score += weights.medications;

    return score;
};

/**
 * Format the summary as a text block for the Gemini prompt
 */
const formatSummaryForPrompt = (summary) => {
    let text = `PATIENT CONTEXT SUMMARY (auto-generated):\n`;
    text += `Snapshot: ${summary.snapshot}\n`;
    text += `Symptoms: ${summary.symptomProfile.summary}\n`;
    text += `Vitals: ${summary.vitalStatus.summary}\n`;
    text += `Risk Profile: ${summary.riskProfile.summary}\n`;
    text += `Data Completeness: ${summary.completenessScore}%\n`;

    if (summary.dataGaps.length > 0) {
        text += `\n⚠ DATA GAPS (${summary.dataGaps.length}):\n`;
        text += summary.dataGaps.map((g) => `  - ${g}`).join('\n');
        text += `\nNote: Missing data reduces triage confidence. Flag data gaps in your assessment.\n`;
    }

    return text;
};

module.exports = {
    buildPatientContextSummary,
    formatSummaryForPrompt,
    classifyVital,
    VITAL_RANGES,
};
