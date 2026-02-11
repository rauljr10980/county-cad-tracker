/**
 * Authentication Middleware
 * JWT-based authentication for protected routes
 */

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // Generate a random secret so the app doesn't crash on startup
  // Tokens will be invalidated on restart — set JWT_SECRET env var for persistence
  const crypto = require('crypto');
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: JWT_SECRET not set — generated a temporary secret. Set JWT_SECRET in Railway variables for persistent sessions.');
}

/**
 * Verify JWT token and attach user to request
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Check if user has required role
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Optional authentication - adds user if token is valid, but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true, email: true, role: true }
      });
      if (user) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore errors in optional auth
  }
  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth,
  JWT_SECRET
};
