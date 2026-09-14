const { sendEmailSmtp } = require('./emailService');

/**
 * Sends a one-off test message using a specific SMTP credential pair.
 * Shared by the self-service POST /api/email/test (the caller's own
 * credentials) and the admin-only POST /api/users/:id/email-settings/test
 * (a teammate's credentials, set by an admin).
 */
async function sendTestEmailWith({ smtpUsername, smtpAppPassword, to }) {
  return sendEmailSmtp({
    to: [to],
    subject: 'Test email from Bexar CRE Acquisition CRM',
    text: 'If you got this, your email is set up correctly.',
    auth: { user: smtpUsername, pass: smtpAppPassword },
  });
}

module.exports = { sendTestEmailWith };
