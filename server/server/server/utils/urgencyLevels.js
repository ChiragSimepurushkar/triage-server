const URGENCY_LEVELS = {
    1: {
        label: 'CRITICAL',
        color: '#EF4444',
        description: 'Immediate life-threatening condition',
        maxWaitTime: '0 minutes',
    },
    2: {
        label: 'URGENT',
        color: '#F97316',
        description: 'Potentially life-threatening, requires urgent attention',
        maxWaitTime: '15 minutes',
    },
    3: {
        label: 'MODERATE',
        color: '#EAB308',
        description: 'Serious but stable, requires timely care',
        maxWaitTime: '30 minutes',
    },
    4: {
        label: 'LOW',
        color: '#22C55E',
        description: 'Minor condition, standard care timeline',
        maxWaitTime: '60 minutes',
    },
    5: {
        label: 'OBSERVATION',
        color: '#3B82F6',
        description: 'Non-urgent, suitable for observation or self-care',
        maxWaitTime: '120 minutes',
    },
};

const getUrgencyByLevel = (level) => {
    return URGENCY_LEVELS[level] || URGENCY_LEVELS[5];
};

const getUrgencyByLabel = (label) => {
    const entry = Object.entries(URGENCY_LEVELS).find(
        ([, val]) => val.label === label.toUpperCase()
    );
    return entry ? { level: parseInt(entry[0]), ...entry[1] } : null;
};

module.exports = { URGENCY_LEVELS, getUrgencyByLevel, getUrgencyByLabel };
