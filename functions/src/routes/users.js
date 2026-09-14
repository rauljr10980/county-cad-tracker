/**
 * User Management Routes
 * User CRUD operations (admin only)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const rateLimit = require('express-rate-limit');
const { sendTestEmailWith } = require('../lib/sendTestEmail');

const router = express.Router();

const adminTestEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many test emails. Wait a while and try again.' }
});

// ============================================================================
// GET ALL USERS (Admin only)
// ============================================================================

router.get('/',
  authenticateToken,
  requireRole('ADMIN', 'OPERATOR'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              assignedTasks: true,
              createdTasks: true,
              notes: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ users });
    } catch (error) {
      console.error('[USERS] Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

// ============================================================================
// GET ALL USERS' EMAIL-SENDING STATUS (Admin only)
// Registered before GET /:id — a literal path segment here would
// otherwise be captured by the :id param route below.
//
// smtpConfigured is derived from smtpUsername alone, never from
// smtpAppPassword — every write path in this file and in
// routes/email.js sets or clears both fields together, so this is a
// safe proxy that keeps the password out of every list response.
// ============================================================================

router.get('/email-settings',
  authenticateToken,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          smtpUsername: true,
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          smtpUsername: u.smtpUsername,
          smtpConfigured: !!u.smtpUsername,
        })),
      });
    } catch (error) {
      console.error('[USERS] Failed to fetch email settings:', error);
      res.status(500).json({ error: 'Failed to fetch email settings' });
    }
  }
);

// ============================================================================
// GET SINGLE USER
// ============================================================================

router.get('/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Users can only view their own profile unless they're admin
      if (req.user.id !== id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              assignedTasks: true,
              createdTasks: true,
              notes: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('[USERS] Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
);

// ============================================================================
// UPDATE USER
// ============================================================================

router.put('/:id',
  authenticateToken,
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('role').optional().isIn(['ADMIN', 'OPERATOR', 'VIEWER']),
    body('isActive').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { id } = req.params;
      const updates = req.body;

      // Users can only update their own profile unless they're admin
      if (req.user.id !== id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Only admins can change roles
      if (updates.role && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change user roles' });
      }

      // Admins can't strip their own admin status — mirrors the
      // self-deactivation guard below, for the same reason: losing this
      // role via your own request would lock you out of the Team tab
      // with no way back in except direct database access.
      if (updates.role && updates.role !== 'ADMIN' && req.user.id === id) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      // Only admins can change account status
      if (updates.isActive !== undefined && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change account status' });
      }
      if (updates.isActive === false && req.user.id === id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }

      // Explicit allowlist — this route must never pass req.body straight
      // through to Prisma. It only ever supported these four fields; this
      // just stops that being implicit. In particular, smtpUsername and
      // smtpAppPassword are deliberately excluded — those are self-service
      // only, via PUT /api/email/settings.
      const data = {};
      if (updates.email !== undefined) data.email = updates.email;
      if (updates.password) data.password = await bcrypt.hash(updates.password, 10);
      if (updates.role !== undefined) data.role = updates.role;
      if (updates.isActive !== undefined) data.isActive = updates.isActive;

      const user = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          updatedAt: true
        }
      });

      res.json(user);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('[USERS] Update error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// ============================================================================
// DELETE USER (Admin only)
// ============================================================================

router.delete('/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Prevent self-deletion
      if (req.user.id === id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      await prisma.user.delete({
        where: { id }
      });

      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('[USERS] Delete error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

// ============================================================================
// SET / CLEAR / TEST A TEAMMATE'S EMAIL SETTINGS (Admin only)
// Mirrors routes/email.js's self-service /settings and /test routes, but
// scoped to any :id rather than req.user.id. Never returns
// smtpAppPassword in any response, matching the self-service routes —
// this is a write/clear/test surface, not a read surface.
// ============================================================================

router.put('/:id/email-settings',
  authenticateToken,
  requireRole('ADMIN'),
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
        where: { id: req.params.id },
        data: { smtpUsername, smtpAppPassword },
      });
      res.json({ smtpConfigured: true, smtpUsername });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('[USERS] Failed to save email settings:', error);
      res.status(500).json({ error: 'Failed to save email settings' });
    }
  }
);

router.delete('/:id/email-settings',
  authenticateToken,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      await prisma.user.update({
        where: { id: req.params.id },
        data: { smtpUsername: null, smtpAppPassword: null },
      });
      res.json({ smtpConfigured: false });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('[USERS] Failed to clear email settings:', error);
      res.status(500).json({ error: 'Failed to clear email settings' });
    }
  }
);

router.post('/:id/email-settings/test',
  authenticateToken,
  requireRole('ADMIN'),
  adminTestEmailLimiter,
  [
    body('to').optional().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { email: true, smtpUsername: true, smtpAppPassword: true },
      });
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (!target.smtpUsername || !target.smtpAppPassword) {
        return res.status(400).json({ error: 'This teammate has not set up their email yet' });
      }
      const recipient = req.body.to || target.email;
      try {
        await sendTestEmailWith({ smtpUsername: target.smtpUsername, smtpAppPassword: target.smtpAppPassword, to: recipient });
        res.json({ success: true });
      } catch (err) {
        res.status(200).json({ success: false, error: String(err.message || err) });
      }
    } catch (error) {
      console.error('[USERS] Test send failed unexpectedly:', error);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  }
);

module.exports = router;
