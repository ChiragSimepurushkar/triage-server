const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const initGemini = () => {
    if (!genAI && process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
    return model;
};

/**
 * Send a prompt to Gemini and get a structured JSON response
 * @param {string} prompt - The full prompt to send
 * @returns {object} Parsed JSON response from Gemini
 */
const generateTriageResponse = async (prompt) => {
    try {
        const geminiModel = initGemini();

        if (!geminiModel) {
            console.warn('⚠️ Gemini API key not configured — returning fallback response');
            return getFallbackResponse();
        }

        const result = await geminiModel.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Try to parse JSON from response
        return parseGeminiResponse(text);
    } catch (error) {
        console.error('❌ Gemini API Error:', error.message);
        return getFallbackResponse(error.message);
    }
};

/**
 * Parse Gemini's text response into JSON
 * Handles cases where JSON is wrapped in markdown code blocks
 */
const parseGeminiResponse = (text) => {
    try {
        // Try direct JSON parse
        return JSON.parse(text);
    } catch {
        // Try extracting from markdown code block
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Fall through
            }
        }

        // Try finding JSON object in text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch {
                // Fall through
            }
        }

        console.error('❌ Could not parse Gemini response as JSON');
        return getFallbackResponse('Failed to parse AI response');
    }
};

/**
 * Fallback response when Gemini is unavailable or fails
 */
const getFallbackResponse = (errorMsg = null) => {
    return {
        urgency_level: 3,
        urgency_label: 'MODERATE',
        primary_concern: 'Unable to complete AI analysis — manual clinical assessment required',
        reasoning: errorMsg
            ? `AI analysis could not be completed: ${errorMsg}. Please perform manual clinical assessment.`
            : 'AI service is currently unavailable. This is a default moderate urgency assignment. Please perform manual clinical assessment.',
        recommended_actions: [
            'Perform manual clinical assessment',
            'Review patient vitals and symptoms',
            'Escalate if clinical judgment indicates higher urgency',
        ],
        vital_flags: [],
        clinician_notes: 'AI analysis was not available — this is a default assignment.',
        confidence: 'LOW',
        disclaimer:
            'This is AI-assisted triage support only. Clinical judgment of the reviewing clinician supersedes this recommendation.',
        _fallback: true,
    };
};

module.exports = { generateTriageResponse, initGemini };
