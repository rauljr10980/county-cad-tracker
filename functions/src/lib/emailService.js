const { Resend } = require('resend');

let resend = null;

function getClient() {
  if (resend) return resend;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is required');
  }

  resend = new Resend(apiKey);
  return resend;
}

/**
 * Send an email via Resend API (HTTPS — no SMTP ports needed)
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @returns {Promise<Object>} Resend send result
 */
async function sendEmail({ to, subject, text }) {
  const client = getClient();
  const from = process.env.EMAIL_FROM || 'County CAD Tracker <onboarding@resend.dev>';

  const recipients = Array.isArray(to) ? to : [to];

  const { data, error } = await client.emails.send({
    from,
    to: recipients,
    subject,
    text,
  });

  if (error) {
    throw new Error(error.message || 'Resend API error');
  }

  console.log(`[EMAIL] Sent to ${recipients.join(', ')} — id: ${data.id}`);
  return data;
}

module.exports = { sendEmail };
