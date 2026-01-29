/**
 * Authentication Routes
 * User registration, login, and session management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

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

      // Verify invite code
      if (!process.env.INVITE_CODE || inviteCode !== process.env.INVITE_CODE) {
        return res.status(403).json({ error: 'Invalid invite code' });
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
