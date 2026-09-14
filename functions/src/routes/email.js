const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { sendEmail, sendEmailSmtp } = require('../lib/emailService');
const { authenticateToken } = require('../middleware/auth');

const testEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many test emails. Wait a while and try again.' }
});

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

    const sender = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { smtpUsername: true, smtpAppPassword: true },
    });
    const auth = (sender.smtpUsername && sender.smtpAppPassword)
      ? { user: sender.smtpUsername, pass: sender.smtpAppPassword }
      : undefined; // falls back to the system GMAIL_USER/GMAIL_APP_PASSWORD

    await sendEmail({
      to: recipients,
      subject,
      text: body,
      auth,
    });

    res.json({ success: true, sent: recipients.length });
  } catch (error) {
    console.error('[EMAIL] Send failed:', error.message);

    if (error.message.includes('Missing credentials') || error.message.includes('Invalid login')) {
      return res.status(500).json({ error: 'Email not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to environment variables.' });
    }

    res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
});

// GET /api/email/settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { smtpUsername: true, smtpAppPassword: true },
    });
    res.json({ configured: !!(user.smtpUsername && user.smtpAppPassword), smtpUsername: user.smtpUsername });
  } catch (error) {
    console.error('[EMAIL] Failed to load settings:', error.message);
    res.status(500).json({ error: 'Failed to load email settings' });
  }
});

// PUT /api/email/settings
router.put('/settings',
  authenticateToken,
  [
    body('smtpUsername').isEmail().normalizeEmail().withMessage('A valid email address is required'),
    body('smtpAppPassword').isLength({ min: 1 }).withMessage('App password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const { smtpUsername, smtpAppPassword } = req.body;
      await prisma.user.update({
        where: { id: req.user.id },
        data: { smtpUsername, smtpAppPassword },
      });
      res.json({ configured: true });
    } catch (error) {
      console.error('[EMAIL] Failed to save settings:', error.message);
      res.status(500).json({ error: 'Failed to save email settings' });
    }
  }
);

// DELETE /api/email/settings
router.delete('/settings', authenticateToken, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { smtpUsername: null, smtpAppPassword: null },
    });
    res.json({ configured: false });
  } catch (error) {
    console.error('[EMAIL] Failed to clear settings:', error.message);
    res.status(500).json({ error: 'Failed to clear email settings' });
  }
});

// POST /api/email/test — sends one email using the caller's saved SMTP
// credentials, to their own account email by default or to `to` in the
// body when provided. Reports the exact error on failure, so a wrong
// port/password is immediately visible.
router.post('/test',
  authenticateToken,
  testEmailLimiter,
  [
    body('to').optional().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { email: true, smtpUsername: true, smtpAppPassword: true },
      });
      if (!user.smtpUsername || !user.smtpAppPassword) {
        return res.status(400).json({ error: 'Set up your email first' });
      }
      const recipient = req.body.to || user.email;
      try {
        await sendEmailSmtp({
          to: [recipient],
          subject: 'Test email from Bexar CRE Acquisition CRM',
          text: 'If you got this, your email is set up correctly.',
          auth: { user: user.smtpUsername, pass: user.smtpAppPassword },
        });
        res.json({ success: true });
      } catch (err) {
        res.status(200).json({ success: false, error: String(err.message || err) });
      }
    } catch (error) {
      console.error('[EMAIL] Test send failed unexpectedly:', error.message);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  }
);

module.exports = router;
