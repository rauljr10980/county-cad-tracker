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

  // Send each email individually so recipients can't see each other
  const results = [];
  for (const recipient of recipients) {
    const data = await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipient.trim() }],
      subject,
      textContent: text,
    });
    console.log(`[EMAIL] Sent to ${recipient} -- messageId: ${data.messageId}`);
    results.push(data);
  }

  return results;
}

module.exports = { sendEmail };
