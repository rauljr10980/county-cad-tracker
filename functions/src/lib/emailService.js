const nodemailer = require('nodemailer');
const dns = require('dns');

// Force Node.js to resolve DNS over IPv4 — Railway doesn't support IPv6
dns.setDefaultResultOrder('ipv4first');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD environment variables are required');
  }

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return transporter;
}

/**
 * Send an email via Gmail SMTP
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @returns {Promise<Object>} Nodemailer send result
 */
async function sendEmail({ to, subject, text }) {
  const t = getTransporter();
  const from = process.env.GMAIL_USER;

  const recipients = Array.isArray(to) ? to.join(', ') : to;

  const info = await t.sendMail({
    from,
    to: recipients,
    subject,
    text,
  });

  console.log(`[EMAIL] Sent to ${recipients} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendEmail };
