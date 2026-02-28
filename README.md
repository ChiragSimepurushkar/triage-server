# 🧠 TriageIQ - Backend (Node.js + Hybrid AI)

**TriageIQ** is an AI-powered medical triage platform designed to bridge the gap between patient intake and clinical review. 

This repository contains the **Express.js API Server**, the **Clinical Knowledge Graph Engine**, and the **Gemini LLM Orchestrator** responsible for generating safe, transparent triage assessments.

---

## 🚀 The Hybrid AI Architecture

TriageIQ does not rely blindly on Generative AI. We use a **Hybrid Approach**:
1. **Clinical Knowledge Base (Graph):** A locally hosted deterministic JSON graph of symptom clusters, differentials, and "red flag" vital signs manually curated by medical guidelines.
2. **Context Window Injection:** The backend maps the patient's unstructured symptoms to exact deterministic graph nodes, pulling connected risk amplifiers and contraindications, and feeding them firmly into the LLM context.
3. **Step-by-step Reasoning Trace:** Gemini outputs a specialized JSON schema including a `reasoning_trace` array explaining exactly why it chose a specific urgency level (1-5).
4. **Independent Confidence Calibration:** An algorithmic layer (`confidenceCalibration.service.js`) running parallel to the LLM scores the AI's confidence based on data completeness and vital stability, automatically flagging edge cases for mandatory "Needs Human Review."

## ✨ Core Backend Features
- **OCR Multi-modal Fallback:** When a user uploads a medical report, the API runs `tesseract.js` locally first. If it extracts good text, we send cheap string data to the LLM. If it fails, we fallback to expensive Gemini Multimodal vision parsing.
- **RESTful Architecture:** Fully isolated route/controller/model architecture (`/api/triage`, `/api/ai`, `/api/auth`, `/api/clinician`).
- **Critical Email Alerts:** Powered by NodeMailer to instantly alert hospital staff if an Urgency Level 1 patient enters the queue.
- **Secure Auth:** JWT-based stateless authentication tied into Google Firebase.

## 💻 Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB Atlas (Mongoose ODM)
- **AI Integration:** `@google/genai` (Gemini 2.5 Flash)
- **OCR:** `tesseract.js`
- **Security:** `cors`, `helmet`, `bcrypt`, JWT

---

## 🛠️ Getting Started

### Prerequisites

You need Node.js (v18+) and npm installed on your machine.
A MongoDB Atlas Cluster URI and a Google Gemini API Key are required for this server to run.

### Setup

1. Clone the repository
   ```bash
   git clone https://github.com/ChiragSimepurushkar/triage-server.git
   cd triage-server
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure Environment Variables
   Create a `.env` file in the root directory:
   ```env
   PORT=5000
   CLIENT_URL=http://localhost:8080 # Or your frontend Vercel URL
   
   MONGO_URI=mongodb+srv://<user>:<password>@clusterxyz.mongodb.net/?retryWrites=true&w=majority
   
   JWT_SECRET=super_secret_key
   JWT_REFRESH_SECRET=super_secret_refresh_key
   
   GEMINI_API_KEY=AIzaSy...
   
   # Optional: Email Notifications
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   ```

4. Start the server
   ```bash
   node server.js
   # Expected Output: ✅ MongoDB Connected -> 📚 Clinical Knowledge Base loaded
   ```

## 🤝 Frontend Application
For the React client, UI components, and visual graph displays, please see the frontend repository: [TriageIQ Frontend Repository](https://github.com/ChiragSimepurushkar/triage-health-hub).
