const nodemailer = require('nodemailer');
const dns = require('dns');
// Mitigates the exact failure this project hit before: Railway's DNS
// resolution preferring an unreachable IPv6 route to smtp.gmail.com.
dns.setDefaultResultOrder('ipv4first');

let transport = null;

function getTransport(auth) {
  // A per-call auth override (the per-user feature) never reuses the
  // cached system transport — different credentials need their own
  // connection. The system transport (no override) is cached once.
  if (!auth && transport) return transport;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const built = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: auth || {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 20000,
  });

  if (!auth) transport = built;
  return built;
}

/**
 * Sends via raw SMTP (nodemailer). `auth`, when given, overrides the
 * system Gmail account with a specific user's own credentials — omit it
 * for system emails (password reset, invites).
 */
async function sendEmailSmtp({ to, subject, text, auth }) {
  const from = (auth && auth.user) || process.env.GMAIL_USER;
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];
  const client = getTransport(auth);
  for (const recipient of recipients) {
    const info = await client.sendMail({ from, to: recipient.trim(), subject, text });
    console.log(`[EMAIL] Sent to ${recipient} via SMTP -- messageId: ${info.messageId}`);
    results.push(info);
  }
  return results;
}

// ============================================================================
// DEACTIVATED — kept intact for a fast reactivation later, not called by
// anything in this codebase right now. Do not delete; do not "clean up."
// ============================================================================
let brevoClient = null;

function getBrevoClient() {
  if (brevoClient) return brevoClient;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is required');
  }
  const { BrevoClient } = require('@getbrevo/brevo');
  brevoClient = new BrevoClient({ apiKey });
  return brevoClient;
}

async function sendEmailBrevo({ to, subject, text }) {
  const brevo = getBrevoClient();
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'Raul.Medina@rbmventuresgroup.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Raul Medina';
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];
  for (const recipient of recipients) {
    const data = await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipient.trim() }],
      subject,
      textContent: text,
    });
    console.log(`[EMAIL] Sent to ${recipient} via Brevo -- messageId: ${data.messageId}`);
    results.push(data);
  }
  return results;
}
// ============================================================================

module.exports = {
  sendEmail: sendEmailSmtp, // the active entry point every call site uses
  sendEmailSmtp,
  sendEmailBrevo, // exported but unused — available for a fast reactivation
};
