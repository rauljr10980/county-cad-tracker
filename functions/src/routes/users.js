/**
 * User Management Routes
 * User CRUD operations (admin only)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

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
    body('role').optional().isIn(['ADMIN', 'OPERATOR', 'VIEWER'])
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

      // Hash password if provided
      if (updates.password) {
        updates.password = await bcrypt.hash(updates.password, 10);
      }

      const user = await prisma.user.update({
        where: { id },
        data: updates,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
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

module.exports = router;
