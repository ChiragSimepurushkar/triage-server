const nodemailer = require('nodemailer');

let transporter = null;

const initTransporter = () => {
    if (transporter) return transporter;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('⚠️ Email credentials not configured — email alerts disabled');
        return null;
    }

    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    return transporter;
};

/**
 * Send a critical alert email
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.patientName - Patient name
 * @param {string} options.urgencyLabel - Urgency label
 * @param {string} options.primaryConcern - Primary concern
 * @param {string} options.sessionId - Session ID for reference
 */
const sendCriticalAlert = async ({ to, patientName, urgencyLabel, primaryConcern, sessionId }) => {
    const transport = initTransporter();

    if (!transport) {
        console.warn('⚠️ Email transport not available — skipping critical alert');
        return null;
    }

    const mailOptions = {
        from: `"TriageIQ Alert" <${process.env.EMAIL_USER}>`,
        to,
        subject: `🚨 CRITICAL TRIAGE ALERT — ${patientName}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #EF4444; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">🚨 Critical Triage Alert</h1>
        </div>
        <div style="background: #1E293B; color: #F8FAFC; padding: 20px; border-radius: 0 0 8px 8px;">
          <p><strong>Patient:</strong> ${patientName}</p>
          <p><strong>Urgency:</strong> <span style="color: #EF4444; font-weight: bold;">${urgencyLabel}</span></p>
          <p><strong>Primary Concern:</strong> ${primaryConcern}</p>
          <p><strong>Session ID:</strong> ${sessionId}</p>
          <hr style="border-color: #334155;">
          <p style="color: #94A3B8; font-size: 12px;">
            This is an automated alert from TriageIQ. Please review this case immediately.
          </p>
        </div>
      </div>
    `,
    };

    try {
        const info = await transport.sendMail(mailOptions);
        console.log(`📧 Critical alert sent: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('❌ Email send error:', error.message);
        return null;
    }
};

module.exports = { sendCriticalAlert };
