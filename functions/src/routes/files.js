/**
 * File Management Routes
 * Handle file listing, deletion, and reprocessing
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// ============================================================================
// GET /api/files - List all file uploads
// ============================================================================

router.get('/', async (req, res) => {
  try {
    const files = await prisma.fileUpload.findMany({
      orderBy: {
        uploadedAt: 'desc'
      }
    });

    console.log(`[FILES] Retrieved ${files.length} file uploads`);

    res.json(files);
  } catch (error) {
    console.error('[FILES] Error fetching files:', error);
    res.status(500).json({
      error: 'Failed to fetch file uploads',
      message: error.message
    });
  }
});

// ============================================================================
// DELETE /api/files/:fileId - Delete a file upload record
// ============================================================================

router.delete('/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Find the file upload
    const fileUpload = await prisma.fileUpload.findUnique({
      where: { fileId }
    });

    if (!fileUpload) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the file upload record
    await prisma.fileUpload.delete({
      where: { fileId }
    });

    console.log(`[FILES] Deleted file upload: ${fileId} by user ${req.user.username}`);

    res.json({
      success: true,
      message: 'File upload record deleted successfully'
    });

  } catch (error) {
    console.error('[FILES] Error deleting file:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: error.message
    });
  }
});

// ============================================================================
// POST /api/files/:fileId/reprocess - Reprocess a file
// ============================================================================

router.post('/:fileId/reprocess', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Find the file upload
    const fileUpload = await prisma.fileUpload.findUnique({
      where: { fileId }
    });

    if (!fileUpload) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Mark file as processing again
    await prisma.fileUpload.update({
      where: { fileId },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
        processedRecords: 0,
        completedAt: null
      }
    });

    console.log(`[FILES] Reprocessing file: ${fileId} by user ${req.user.username}`);

    // Note: In a real implementation, you would trigger the actual file processing here
    // For now, we'll just mark it as processing
    res.json({
      success: true,
      message: 'File reprocessing started',
      fileId
    });

  } catch (error) {
    console.error('[FILES] Error reprocessing file:', error);
    res.status(500).json({
      error: 'Failed to reprocess file',
      message: error.message
    });
  }
});

module.exports = router;
