/**
 * Notes Management Routes
 * Property notes with author tracking and timestamps
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// GET NOTES FOR A PROPERTY
// ============================================================================

router.get('/',
  optionalAuth,
  [
    query('propertyId').isString().notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { propertyId } = req.query;

      const notes = await prisma.note.findMany({
        where: { propertyId },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ notes });
    } catch (error) {
      console.error('[NOTES] Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  }
);

// ============================================================================
// GET SINGLE NOTE
// ============================================================================

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const note = await prisma.note.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: { id: true, username: true, email: true }
        },
        property: {
          select: {
            id: true,
            accountNumber: true,
            ownerName: true,
            propertyAddress: true
          }
        }
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(note);
  } catch (error) {
    console.error('[NOTES] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// ============================================================================
// CREATE NOTE
// ============================================================================

router.post('/',
  authenticateToken,
  [
    body('propertyId').isString().notEmpty(),
    body('content').isString().notEmpty().withMessage('Note content is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { propertyId, content } = req.body;

      // Verify property exists
      const property = await prisma.property.findUnique({
        where: { id: propertyId }
      });

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Create note
      const note = await prisma.note.create({
        data: {
          propertyId,
          content,
          authorId: req.user.id
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              email: true
            }
          },
          property: {
            select: {
              id: true,
              accountNumber: true,
              ownerName: true
            }
          }
        }
      });

      res.status(201).json(note);
    } catch (error) {
      console.error('[NOTES] Create error:', error);
      res.status(500).json({ error: 'Failed to create note' });
    }
  }
);

// ============================================================================
// UPDATE NOTE
// ============================================================================

router.put('/:id',
  authenticateToken,
  [
    body('content').isString().notEmpty().withMessage('Note content is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { id } = req.params;
      const { content } = req.body;

      // Check if note exists and user is the author
      const existingNote = await prisma.note.findUnique({
        where: { id }
      });

      if (!existingNote) {
        return res.status(404).json({ error: 'Note not found' });
      }

      if (existingNote.authorId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'You can only edit your own notes' });
      }

      // Update note
      const note = await prisma.note.update({
        where: { id },
        data: { content },
        include: {
          author: {
            select: { id: true, username: true, email: true }
          }
        }
      });

      res.json(note);
    } catch (error) {
      console.error('[NOTES] Update error:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  }
);

// ============================================================================
// DELETE NOTE
// ============================================================================

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if note exists and user is the author or admin
    const note = await prisma.note.findUnique({
      where: { id }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (note.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'You can only delete your own notes' });
    }

    await prisma.note.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('[NOTES] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
