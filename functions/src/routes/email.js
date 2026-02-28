const express = require('express');
const router = express.Router();
const { sendEmail } = require('../lib/emailService');
const { authenticateToken } = require('../middleware/auth');

// POST /api/email/send
// Body: { to: string | string[], subject: string, body: string }
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    // Normalize recipients — accept string, comma-separated string, or array
    let recipients;
    if (Array.isArray(to)) {
      recipients = to.map(e => e.trim()).filter(Boolean);
    } else {
      recipients = to.split(/[,;\n]+/).map(e => e.trim()).filter(e => e.includes('@'));
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No valid email addresses provided' });
    }

    console.log(`[EMAIL] User ${req.user?.username || 'unknown'} sending to ${recipients.length} recipient(s)`);

    await sendEmail({
      to: recipients,
      subject,
      text: body,
    });

    res.json({ success: true, sent: recipients.length });
  } catch (error) {
    console.error('[EMAIL] Send failed:', error.message);

    if (error.message.includes('GMAIL_USER')) {
      return res.status(500).json({ error: 'Email not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to environment variables.' });
    }

    if (error.message.includes('Invalid login') || error.code === 'EAUTH') {
      return res.status(500).json({ error: 'Gmail authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD are correct.' });
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
      return res.status(500).json({ error: 'Connection to Gmail timed out. Check your app password is correct.' });
    }

    res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
});

module.exports = router;
