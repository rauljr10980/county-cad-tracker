const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD environment variables are required');
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
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
