/**
 * Authentication Routes
 * User registration, login, and session management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole, JWT_SECRET } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const rateLimit = require('express-rate-limit');
const { sendOnce } = require('../lib/emailOutbox');
const { inviteStatus } = require('../lib/inviteStatus');

const router = express.Router();

// Where reset-password and invite links point back to. The frontend is a
// static GitHub Pages build with hash-based routing (see src/pages/Index.tsx),
// so these are '#'-fragment links, not real paths.
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://rauljr10980.github.io/county-cad-tracker';

// ============================================================================
// REGISTER
// ============================================================================

router.post('/register',
  [
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('inviteCode').trim().notEmpty().withMessage('Invite code is required')
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { username, email, password, inviteCode } = req.body;

      // Verify invite code — a per-email, single-use, expiring Invite row,
      // looked up by the SHA-256 hash of the raw token in the link (the raw
      // token itself is never stored, same pattern as password-reset tokens
      // below).
      const inviteTokenHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
      const invite = await prisma.invite.findUnique({ where: { tokenHash: inviteTokenHash } });

      if (!invite || invite.revokedAt || invite.usedAt || invite.expiresAt < new Date() || invite.email !== email) {
        return res.status(403).json({ error: 'This invite link is invalid, expired, or has already been used' });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          error: existingUser.username === username
            ? 'Username already taken'
            : 'Email already registered'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          role: 'OPERATOR' // Default role
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true
        }
      });

      await prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.status(201).json({
        success: true,
        token,
        user
      });
    } catch (error) {
      console.error('[AUTH] Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// ============================================================================
// LOGIN
// ============================================================================

router.post('/login',
  [
    body('username').trim().notEmpty().withMessage('Username required'),
    body('password').notEmpty().withMessage('Password required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { username, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { username }
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('[AUTH] Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ============================================================================
// VERIFY PASSWORD (soft gate for the Evictions CRM workspace)
// ============================================================================

// This is a UI affordance, not access control — the caller's JWT already
// authorizes the underlying endpoints. Rate limited so it cannot be used as a
// password oracle.
const verifyPasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  message: { error: 'Too many attempts. Wait a minute and try again.' }
});

router.post('/verify-password',
  authenticateToken,
  verifyPasswordLimiter,
  [body('password').notEmpty().withMessage('Password required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      // authenticateToken selects only id/username/email/role, so the hash has
      // to be fetched here.
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const valid = await bcrypt.compare(req.body.password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('[AUTH] Verify password error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  }
);

// ============================================================================
// SESSION CHECK
// ============================================================================

router.get('/session', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ============================================================================
// LOGOUT
// ============================================================================

router.post('/logout', authenticateToken, async (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  // Could implement token blacklist here if needed
  res.json({ success: true, message: 'Logged out successfully' });
});

// ============================================================================
// FORGOT / RESET PASSWORD
// ============================================================================

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many attempts. Wait a while and try again.' }
});

router.post('/forgot-password',
  forgotPasswordLimiter,
  [body('email').isEmail().normalizeEmail().withMessage('Invalid email address')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { email } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });

      // Same response whether or not the email is registered, so this
      // endpoint can't be used to find out who has an account.
      if (user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        await prisma.user.update({
          where: { id: user.id },
          data: {
            resetToken: hashedToken,
            resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          },
        });

        const resetUrl = `${FRONTEND_URL}/#reset-password=${rawToken}`;
        try {
          // No specific person is "sending" a password-reset (the account
          // holder triggers it themselves), so there's no req.user to look
          // up like /invites does. Instead, use any Manager's configured
          // Gmail credentials as the sending account — falls back to the
          // shared system GMAIL_USER/GMAIL_APP_PASSWORD only if no admin
          // has set one up.
          const adminSender = await prisma.user.findFirst({
            where: { role: 'ADMIN', smtpUsername: { not: null }, smtpAppPassword: { not: null } },
            select: { smtpUsername: true, smtpAppPassword: true },
          });
          const auth = adminSender
            ? { user: adminSender.smtpUsername, pass: adminSender.smtpAppPassword }
            : undefined;

          await sendOnce({
            templateKey: 'password_reset',
            dedupeKey: hashedToken,
            to: [user.email],
            subject: 'Reset your password',
            text: `We received a request to reset your password.\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
            auth,
          });
        } catch (emailError) {
          // The token is already saved; a failed send just means this
          // particular email didn't go out. Don't leak that to the client —
          // the response stays generic either way.
          console.error('[AUTH] Failed to send password reset email:', emailError);
        }
      }

      res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    } catch (error) {
      console.error('[AUTH] Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
);

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many attempts. Wait a while and try again.' }
});

router.post('/reset-password',
  resetPasswordLimiter,
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { token, password } = req.body;
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await prisma.user.findFirst({
        where: { resetToken: hashedToken, resetTokenExpiresAt: { gt: new Date() } },
      });

      if (!user) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, resetToken: null, resetTokenExpiresAt: null },
      });

      res.json({ success: true, message: 'Password updated. You can now log in.' });
    } catch (error) {
      console.error('[AUTH] Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// ============================================================================
// INVITES (ADMIN only)
// ============================================================================

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many invites sent. Wait a while and try again.' }
});

router.post('/invites',
  authenticateToken,
  requireRole('ADMIN'),
  inviteLimiter,
  [body('email').isEmail().normalizeEmail().withMessage('Invalid email address')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { email } = req.body;
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await prisma.invite.create({
        data: { email, tokenHash, invitedById: req.user.id, expiresAt },
        select: { id: true, email: true, expiresAt: true, createdAt: true },
      });

      const signupUrl = `${FRONTEND_URL}/#signup=${rawToken}`;
      try {
        // Sends from the inviting admin's own Gmail when they've configured
        // one (same lookup as POST /api/email/send), falling back to the
        // shared system GMAIL_USER/GMAIL_APP_PASSWORD otherwise.
        const sender = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { smtpUsername: true, smtpAppPassword: true },
        });
        const auth = (sender.smtpUsername && sender.smtpAppPassword)
          ? { user: sender.smtpUsername, pass: sender.smtpAppPassword }
          : undefined;

        await sendOnce({
          templateKey: 'invite',
          dedupeKey: invite.id,
          to: [email],
          subject: "You're invited to Bexar CRE Acquisition CRM",
          text: `${req.user.username} has invited you to join the team.\n\n${signupUrl}\n\nThis link expires in 7 days and can only be used once.`,
          auth,
        });
      } catch (emailError) {
        // The invite row is already saved; a failed send just means this
        // particular email didn't go out. The admin can see it's still
        // "pending" on the Team tab and re-invite the same address if needed.
        console.error('[AUTH] Failed to send invite email:', emailError);
      }

      res.status(201).json({ success: true, invite });
    } catch (error) {
      console.error('[AUTH] Create invite error:', error);
      res.status(500).json({ error: 'Failed to send invite' });
    }
  }
);

router.get('/invites', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        invitedBy: { select: { username: true } },
      },
    });

    res.json({
      invites: invites.map((invite) => ({ ...invite, status: inviteStatus(invite) })),
    });
  } catch (error) {
    console.error('[AUTH] List invites error:', error);
    res.status(500).json({ error: 'Failed to load invites' });
  }
});

router.delete('/invites/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.invite.update({
      where: { id: req.params.id },
      data: { revokedAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Invite not found' });
    }
    console.error('[AUTH] Revoke invite error:', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// ============================================================================
// VERIFY EMAIL
// ============================================================================

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Verify the token (this should be a JWT or similar token with user info)
    // For now, just return success - implement actual token verification if needed
    // You would decode the token and update the user's emailVerified field
    
    res.json({ 
      success: true, 
      message: 'Email verified successfully' 
    });
  } catch (error) {
    console.error('[AUTH] Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

module.exports = router;
