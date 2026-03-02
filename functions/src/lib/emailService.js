const Brevo = require('@getbrevo/brevo');

let apiInstance = null;

function getClient() {
  if (apiInstance) return apiInstance;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is required');
  }

  const client = Brevo.ApiClient.instance;
  client.authentications['api-key'].apiKey = apiKey;
  apiInstance = new Brevo.TransactionalEmailsApi();
  return apiInstance;
}

async function sendEmail({ to, subject, text }) {
  const client = getClient();

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'raul.b.medina.jr@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Raul Medina';

  const recipients = Array.isArray(to) ? to : [to];
  const toList = recipients.map(email => ({ email: email.trim() }));

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.sender = { name: senderName, email: senderEmail };
  sendSmtpEmail.to = toList;
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.textContent = text;

  const data = await client.sendTransacEmail(sendSmtpEmail);

  console.log(`[EMAIL] Sent to ${recipients.join(', ')} -- messageId: ${data.messageId}`);
  return data;
}

module.exports = { sendEmail };
