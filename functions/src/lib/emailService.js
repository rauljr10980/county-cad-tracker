const nodemailer = require('nodemailer');
const { resolve4 } = require('dns').promises;

let transporter = null;
let resolvedHost = null;

async function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD environment variables are required');
  }

  // Resolve smtp.gmail.com to IPv4 manually — Railway doesn't support IPv6
  if (!resolvedHost) {
    try {
      const addresses = await resolve4('smtp.gmail.com');
      resolvedHost = addresses[0];
      console.log(`[EMAIL] Resolved smtp.gmail.com to IPv4: ${resolvedHost}`);
    } catch {
      resolvedHost = 'smtp.gmail.com';
      console.log('[EMAIL] DNS resolve failed, using hostname directly');
    }
  }

  transporter = nodemailer.createTransport({
    host: resolvedHost,
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { servername: 'smtp.gmail.com' },
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
  const t = await getTransporter();
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
