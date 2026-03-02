const { BrevoClient } = require('@getbrevo/brevo');

let client = null;

function getClient() {
  if (client) return client;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is required');
  }

  client = new BrevoClient({ apiKey });
  return client;
}

async function sendEmail({ to, subject, text }) {
  const brevo = getClient();

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'Raul.Medina@rbmventuresgroup.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Raul Medina';

  const recipients = Array.isArray(to) ? to : [to];
  const toList = recipients.map(email => ({ email: email.trim() }));

  const data = await brevo.transactionalEmails.sendTransacEmail({
    sender: { name: senderName, email: senderEmail },
    to: toList,
    subject,
    textContent: text,
  });

  console.log(`[EMAIL] Sent to ${recipients.join(', ')} -- messageId: ${data.messageId}`);
  return data;
}

module.exports = { sendEmail };
