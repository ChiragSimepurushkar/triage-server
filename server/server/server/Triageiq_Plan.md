# TriageIQ — Complete Hackathon Strategy & Implementation Plan
### GEC Coders' Club Hack Day 2026 | PS #3: AI-Based Clinical Triage Decision Support

---

## My Honest Assessment of Your Plan

Your architecture thinking is **genuinely excellent for a product company**. The MongoDB + Neo4j + Graph RAG stack is production-grade and technically impressive. Here's the verdict:

> [!WARNING]
> **The plan as written will not finish in time.** Full Neo4j Graph RAG alone is a 3–5 day engineering task. The directory is currently empty, and you have ~19 hours total across both phases starting now.

> [!IMPORTANT]
> **The good news:** Your core *concept* is perfect. The fix is scoping — not redesigning. The de-risked stack below gives you 90% of the impressiveness at a fraction of the build time.

---

## Recommended Final Architecture (De-Risked)

### What Changes & Why

| Component | Original Plan | Recommended | Why |
|-----------|--------------|-------------|-----|
| Knowledge Graph | Neo4j AuraDB + Cypher | **JSON Knowledge Base** | Neo4j setup, schema, ingestion = 5+ hrs alone |
| Local LLM | Ollama for embeddings | **Skip entirely** | 8GB RAM is too tight with Neo4j + Node + browser |
| Frontend Framework | React + Vite + shadcn + Recharts | **Same — keep it** | Good choice, no change needed |
| Backend | Node.js + Express | **Same — keep it** | |
| Database | MongoDB Atlas | **Same — keep it** | |
| AI | Gemini 1.5 Flash | **Same — Gemini Flash** | Free tier, fast, great for structured JSON output |
| Embeddings | Gemini Embedding API | **Only if time permits** | Skip in v1, add as enhancement |
| Deployment | Vercel | **Same** | |

### The "Looks Like Graph RAG" Approach

Instead of Neo4j, build a **Clinical Knowledge Base** — a curated JSON file (pre-built tonight) that maps symptom clusters to urgency levels, context, and actions. Your backend looks this up at runtime and injects it as context into Gemini's prompt.

**This IS Retrieval-Augmented Generation.** You retrieve from a curated knowledge store, augment Gemini's prompt, and generate a structured response. It's architecturally identical — just with a different retrieval backend. Tell judges exactly this.

```
User submits: [chest_pain, sweating, left_arm_numbness] + BP: 160/95, SpO2: 94%
        ↓
Backend looks up clinical knowledge base → returns cardiac subgraph context
        ↓
Gemini Flash receives: symptoms + vitals + clinical context
        ↓
Returns: { urgency: "CRITICAL", level: 1, reasoning: "...", actions: [...] }
        ↓
Saved to MongoDB → Displayed in clinician dashboard
```

---

## Final Tech Stack (Confirmed)

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + Tailwind CSS + shadcn/ui + Recharts |
| **Backend** | Node.js + Express.js |
| **Database** | MongoDB Atlas (free tier) |
| **AI** | Google Gemini 1.5 Flash API |
| **Auth** | JWT (access + refresh tokens) |
| **File Uploads** | Multer (lab report PDFs) |
| **Email** | Nodemailer (critical alerts) |
| **Deployment** | Vercel (frontend) + Railway/Render (backend) |
| **Knowledge Base** | Curated JSON — `clinicalKnowledgeBase.json` |

> [!TIP]
> Use Railway or Render for the Express backend instead of Vercel serverless. Cold starts on Vercel serverless + MongoDB connections are painful to debug in a hackathon. Railway gives you a persistent Node process.

---

## Project File Structure

```
triageiq/
├── client/                          # React + Vite Frontend
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   └── MobileBottomNav.jsx
│   │   │   ├── triage/
│   │   │   │   ├── SymptomSelector.jsx      ← body diagram + tag selector
│   │   │   │   ├── VitalsInput.jsx          ← with live range warnings
│   │   │   │   ├── MedicalHistoryForm.jsx
│   │   │   │   ├── TriageStepWizard.jsx     ← multi-step form
│   │   │   │   └── UrgencyBadge.jsx
│   │   │   ├── dashboard/
│   │   │   │   ├── TriageQueueCard.jsx
│   │   │   │   ├── StatsCard.jsx
│   │   │   │   ├── AIRecommendationPanel.jsx ← THE KEY COMPONENT
│   │   │   │   ├── VitalsChart.jsx
│   │   │   │   └── UrgencyDistributionChart.jsx
│   │   │   └── shared/
│   │   │       ├── UrgencyBadge.jsx
│   │   │       ├── Modal.jsx
│   │   │       ├── Toast.jsx
│   │   │       └── ProtectedRoute.jsx
│   │   ├── pages/
│   │   │   ├── Landing.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── patient/
│   │   │   │   ├── PatientHome.jsx
│   │   │   │   ├── NewTriageSession.jsx     ← wizard form
│   │   │   │   ├── TriageHistory.jsx
│   │   │   │   ├── SessionDetail.jsx
│   │   │   │   └── PatientProfile.jsx
│   │   │   ├── clinician/
│   │   │   │   ├── ClinicianDashboard.jsx
│   │   │   │   ├── PatientQueue.jsx
│   │   │   │   ├── SessionReview.jsx        ← most important page
│   │   │   │   └── Analytics.jsx
│   │   │   └── admin/
│   │   │       └── AdminDashboard.jsx
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useTriage.js
│   │   ├── store/                           # Zustand or Context
│   │   ├── api/                             # Axios instance + API calls
│   │   │   ├── axios.js
│   │   │   ├── authApi.js
│   │   │   ├── triageApi.js
│   │   │   └── patientApi.js
│   │   ├── utils/
│   │   │   └── urgencyColors.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── server/                          # Node.js + Express Backend
    ├── controllers/
    │   ├── auth.controller.js
    │   ├── triage.controller.js      ← core: create session, get queue
    │   ├── patient.controller.js
    │   ├── vitals.controller.js
    │   ├── ai.controller.js          ← Gemini call + KB lookup
    │   ├── clinician.controller.js
    │   └── analytics.controller.js
    ├── models/
    │   ├── User.model.js             ← role: patient|clinician|admin
    │   ├── TriageSession.model.js    ← main document
    │   ├── Patient.model.js
    │   ├── Vitals.model.js
    │   └── AIRecommendation.model.js
    ├── routes/
    │   ├── auth.routes.js
    │   ├── triage.routes.js
    │   ├── patient.routes.js
    │   ├── ai.routes.js
    │   ├── clinician.routes.js
    │   └── analytics.routes.js
    ├── middleware/
    │   ├── auth.middleware.js        ← JWT verify
    │   ├── role.middleware.js        ← role guard
    │   └── errorHandler.js
    ├── services/
    │   ├── gemini.service.js         ← Gemini Flash API wrapper
    │   ├── triageEngine.service.js   ← KB lookup + prompt builder
    │   └── email.service.js
    ├── knowledge/
    │   └── clinicalKnowledgeBase.json  ← YOUR "GRAPH RAG" BACKBONE
    ├── utils/
    │   ├── generateTokens.js
    │   └── urgencyLevels.js
    ├── app.js
    ├── server.js
    ├── .env
    └── package.json
```

---

## The Clinical Knowledge Base (Build Tonight — Phase 1 Priority #1)

This JSON is the most critical artifact. Spend 2 hours building it carefully.

### Structure

```json
{
  "symptom_clusters": [
    {
      "id": "cardiac_acute",
      "tags": ["chest_pain", "sweating", "left_arm_numbness", "jaw_pain"],
      "match_threshold": 2,
      "urgency_level": 1,
      "urgency_label": "CRITICAL",
      "color": "red",
      "clinical_context": "High probability of acute cardiac event. Symptom triad of chest pain, diaphoresis, and referred pain is classic MI presentation.",
      "vital_flags": {
        "bp_systolic_gt": 140,
        "spo2_lt": 95,
        "hr_gt": 100
      },
      "next_actions": [
        "Administer 12-lead ECG immediately",
        "Call cardiologist on duty",
        "Aspirin 300mg if not contraindicated",
        "IV access + troponin blood draw",
        "Prepare for possible cath lab activation"
      ],
      "risk_amplifiers": ["diabetes", "hypertension", "smoking", "obesity", "family_history_cardiac"]
    },
    {
      "id": "respiratory_distress",
      "tags": ["shortness_of_breath", "chest_tightness", "wheezing", "cyanosis"],
      "match_threshold": 2,
      "urgency_level": 1,
      "urgency_label": "CRITICAL",
      "color": "red",
      "clinical_context": "Acute respiratory compromise. Hypoxia risk is high.",
      "vital_flags": { "spo2_lt": 92, "rr_gt": 24 },
      "next_actions": [
        "Supplemental oxygen immediately",
        "Nebulised bronchodilator",
        "Arterial blood gas",
        "Prepare for possible intubation"
      ],
      "risk_amplifiers": ["asthma", "copd", "smoking"]
    }
  ]
}
```

### Cover These 8 Clusters (minimum for strong demo)

| # | Cluster | Urgency | Key Symptoms |
|---|---------|---------|--------------|
| 1 | Acute Cardiac Event | CRITICAL (1) | Chest pain, sweating, arm numbness |
| 2 | Acute Respiratory Distress | CRITICAL (1) | Dyspnea, cyanosis, wheezing |
| 3 | Stroke/TIA | CRITICAL (1) | Facial droop, arm weakness, speech issues (FAST) |
| 4 | Severe Allergic Reaction | CRITICAL (1) | Hives, throat swelling, BP drop |
| 5 | High Fever + Infection | URGENT (2) | Fever >39°C, chills, confusion |
| 6 | Moderate Trauma | URGENT (2) | Head injury, numbness in limbs |
| 7 | Abdominal Pain | MODERATE (3) | Location-based, vomiting, bloating |
| 8 | Mild Symptoms | LOW (4) | Cough, sore throat, minor pain |

---

## Gemini Prompt Engineering — The Core of Your AI Layer

This is where you **must invest time**. Bad prompt = bad output. Here's the production-quality prompt template:

```javascript
// server/services/triageEngine.service.js

const buildTriagePrompt = (patientData, clinicalContext) => {
  return `
You are a clinical triage decision support system. Your role is to assist clinicians — NOT to diagnose patients.

PATIENT DATA:
- Age: ${patientData.age}, Gender: ${patientData.gender}
- Chief Complaint: ${patientData.chiefComplaint}
- Reported Symptoms: ${patientData.symptoms.join(', ')}
- Symptom Duration: ${patientData.duration}
- Vitals: BP ${patientData.bp}, HR ${patientData.hr}bpm, SpO2 ${patientData.spo2}%, Temp ${patientData.temp}°C, RR ${patientData.rr}/min
- Medical History: ${patientData.medicalHistory.join(', ') || 'None reported'}
- Current Medications: ${patientData.medications.join(', ') || 'None'}
- Allergies: ${patientData.allergies || 'None known'}

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
```

> [!TIP]
> Always request JSON output from Gemini and use `response.candidates[0].content.parts[0].text` + `JSON.parse()`. Add a try-catch fallback that returns a structured error response — never let a Gemini failure crash your triage endpoint.

---

## Hour-by-Hour Execution Plan

> **Current time: ~6:50 PM IST, Feb 27** | Phase 1 ends at ~9 AM Feb 28 | Phase 2: 9 AM–2 PM Feb 28

### Phase 1 — Tonight (Online, ~14 hours)

| Time | Who | Task | Priority |
|------|-----|------|----------|
| 6:30–9:00 PM | Person A (Backend lead) | Init Express server, MongoDB connection, User + TriageSession models, auth routes (JWT) | 🔴 Critical |
| 6:30–9:00 PM | Person B (Frontend lead) | Init Vite + React project, Tailwind config, routing setup, Login + Register pages | 🔴 Critical |
| 6:30–9:00 PM | Person C (AI/Data lead) | **Build `clinicalKnowledgeBase.json`** — all 8+ clusters, curate next actions per cluster | 🔴 Critical |
| 9:00–11:00 PM | Person A | Triage routes: POST `/api/triage`, GET `/api/triage/:id`, GET `/api/triage/queue` | 🔴 Critical |
| 9:00–11:00 PM | Person B | Landing page, Patient Home, New Triage Wizard (Steps 1–4) | 🔴 Critical |
| 9:00–11:00 PM | Person C | Gemini service + triageEngine service + test Gemini calls via Postman | 🔴 Critical |
| 11:00 PM–1:00 AM | Person A | AI recommendation route, vitals model, connect Gemini service to triage controller | 🟠 High |
| 11:00 PM–1:00 AM | Person B | Clinician Dashboard, Patient Queue page, UrgencyBadge component | 🟠 High |
| 11:00 PM–1:00 AM | Person C | Integrate KB lookup into engine, test end-to-end triage POST → Gemini → response | 🟠 High |
| 1:00–3:00 AM | All | Integration: connect frontend triage form → backend → Gemini → display result | 🔴 Critical |
| 3:00–5:00 AM | Person B | Session Review page (clinician view with AI panel), polish Queue page | 🟠 High |
| 5:00–7:00 AM | Person A | Analytics route, email alert for CRITICAL urgency, audit log | 🟡 Medium |
| 7:00–8:30 AM | All | Bug fixes, test full flow, prepare demo script, deploy to Railway + Vercel | 🔴 Critical |

### Phase 2 — Offline Sprint (9 AM–2 PM, 5 hours)

> The sub-problem statement may require pivoting. Have a clean working v1 from Phase 1 before you arrive.

| Time | Task |
|------|------|
| 9:00–9:30 AM | Read sub-problem, assign tasks, do NOT change core architecture |
| 9:30–11:30 AM | Implement sub-problem feature (likely a specific scenario or role) |
| 11:30 AM–12:30 PM | Polish UI: animations, mobile responsiveness, empty states |
| 12:30–1:30 PM | Record demo video, write project write-up |
| 1:30–2:00 PM | Submit: GitHub link, live URL, write-up, demo video |

---

## MVP Scope — What MUST Work for Demo

Build these in order. Stop and polish if time runs out — never add features at the expense of these.

### Absolute Must-Haves (MVP)
- [ ] Patient can register + login
- [ ] Patient can submit triage form (symptoms, vitals, history)
- [ ] Backend calls Gemini correctly and returns urgency level
- [ ] Triage result (urgency + reasoning + actions) is displayed to patient
- [ ] Clinician can login and see triage queue sorted by urgency
- [ ] Clinician can open a session and see AI recommendation panel
- [ ] Urgency color coding works (red/orange/yellow/green/blue)

### Should Have (Demo Polish)
- [ ] Clinician can add override notes on a session
- [ ] VitalsInput shows red warning when values are out of range
- [ ] SMS/email trigger for CRITICAL cases
- [ ] Analytics chart showing today's triage breakdown by urgency

### Nice to Have (If Time Allows)
- [ ] PDF export of a triage session
- [ ] Admin dashboard
- [ ] Patient notification page

---

## MongoDB Data Models (Simplified for Speed)

```javascript
// TriageSession.model.js — most important model
{
  patientId: ObjectId,
  createdAt: Date,
  status: { type: String, enum: ['pending', 'reviewed', 'closed'], default: 'pending' },
  symptoms: [{ name: String, severity: Number, duration: String }],
  vitals: {
    bp_systolic: Number, bp_diastolic: Number,
    heart_rate: Number, spo2: Number,
    temperature: Number, respiratory_rate: Number
  },
  medicalHistory: { conditions: [String], medications: [String], allergies: String },
  aiRecommendation: {
    urgency_level: Number,       // 1-5
    urgency_label: String,       // CRITICAL | URGENT | MODERATE | LOW | OBSERVATION
    primary_concern: String,
    reasoning: String,
    recommended_actions: [String],
    vital_flags: [String],
    clinician_notes: String,
    confidence: String,
    knowledgeBaseCluster: String // which KB cluster matched
  },
  clinicianOverride: {
    clinicianId: ObjectId,
    notes: String,
    finalUrgency: Number,
    timestamp: Date
  }
}
```

---

## Frontend Design Spec

### Color System
```css
/* Urgency Colors — use consistently everywhere */
--critical:    #EF4444;  /* red-500 */
--urgent:      #F97316;  /* orange-500 */
--moderate:    #EAB308;  /* yellow-500 */
--low:         #22C55E;  /* green-500 */
--observation: #3B82F6;  /* blue-500 */

/* App Theme */
--primary:     #0EA5E9;  /* sky-500 — medical blue */
--bg-dark:     #0F172A;  /* slate-900 */
--surface:     #1E293B;  /* slate-800 */
--text:        #F8FAFC;  /* slate-50 */
```

### Key UI Moments for Demo
1. **Vitals Input** — When BP > 180 or SpO2 < 92, the field glows red in real time. Instant wow factor.
2. **AI Analysis Loading** — Show a skeleton loader with "Analyzing clinical context..." text while Gemini processes.
3. **Urgency Reveal** — Animate the urgency badge appearing with a pulse animation. CRITICAL = red pulse effect.
4. **AI Recommendation Panel** — Show: urgency label → primary concern → reasoning → actions checklist. This is your hero moment.
5. **Clinician Queue** — Auto-sorted by urgency, CRITICAL cases at top with blinking indicator.

---

## Demo Script (5-Minute Video)

> Practice this before Phase 2 ends. Polish > features.

```
0:00-0:30  Landing page — state the problem: "ER triage is manual, slow, error-prone"
0:30-1:00  Register as patient / login as patient
1:00-2:00  Submit triage form: classic MI symptoms (chest pain, sweating, left arm pain)
           + abnormal vitals (high BP, low SpO2)
           → Show vitals turning red in real time
2:00-2:30  AI processing loader → CRITICAL result appears with full reasoning
2:30-3:30  Login as clinician → see patient queue (CRITICAL at top)
           → Open session → AI Recommendation panel explains why it's critical
           → Clinician adds override note → marks reviewed
3:30-4:00  Show analytics chart — "TriageIQ processed X patients today, Y were critical"
4:00-5:00  Architecture slide: explain KB-grounded RAG → Gemini routing → no hallucination
           "This is not a diagnosis tool — it's clinical decision support"
```

---

## Presentation Talking Points for Judges

### On AI Architecture
*"We built a clinical knowledge base that maps validated symptom clusters to urgency pathways. At runtime, our system retrieves the relevant clinical context and uses it to ground Gemini's response — preventing hallucination and ensuring recommendations are anchored in curated medical knowledge. This is retrieval-augmented generation with a curated clinical retrieval store."*

### On Safety & Responsibility
*"TriageIQ is explicitly not a diagnostic tool. Every recommendation includes a mandatory disclaimer that clinical judgment supersedes AI output. Clinicians can override any AI recommendation. Every decision is logged for audit compliance."*

### On Startup Potential
*"The immediate market is hospital ERs in tier-2 and tier-3 cities that lack experienced triage nurses. A secondary market is telemedicine platforms that need a pre-consultation urgency filter. The data we collect — symptom-urgency outcome pairs — becomes a training dataset for a future fine-tuned triage model."*

### On Gemini
*"We use Gemini Flash specifically because it returns structured JSON reliably, handles medical terminology well, and the free tier rate limits are generous enough for a production pilot. The prompt is engineered to prevent diagnosis framing and enforce decision-support framing in every response."*

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Gemini API rate limit hit | Cache last response, exponential backoff, show cached result with timestamp |
| MongoDB Atlas connection drops | Connection pooling, mongoose reconnect on error, local fallback mock data for demo |
| Gemini returns non-JSON | Regex fallback to extract JSON from markdown code blocks, final fallback to hardcoded safe response |
| Demo laptop crashes | Deploy before Phase 2 ends, test on mobile browser as backup |
| Sub-problem completely changes scope | Have modular code — add a new controller/page, don't rewrite existing |

---

## Winning Checklist

- [ ] Working end-to-end flow (patient → AI → clinician)
- [ ] Gemini is actually called and reasoning is shown (not faked)
- [ ] Role-based login (patient + clinician personas in demo)
- [ ] Beautiful UI with urgency color coding
- [ ] Explainable AI panel (why was urgency level X chosen?)
- [ ] "Not a diagnosis" framing is clear in UI
- [ ] GitHub repo is clean with a good README
- [ ] Demo video shows full flow in under 5 minutes
- [ ] Deployed and accessible via public URL

---

*Built for GEC Coders' Club Hack Day 2026 | TriageIQ Team*
