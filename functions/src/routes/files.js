/**
 * File Management Routes
 * Handle file listing, deletion, and reprocessing
 */

const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
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

    // Transform to match frontend expectations
    const transformedFiles = files.map(file => {
      // Map database status to frontend status
      let status = file.status.toLowerCase();
      if (status === 'failed') status = 'error';

      return {
        id: file.id,
        filename: file.filename,
        uploadedAt: file.uploadedAt.toISOString(),
        processedAt: file.completedAt?.toISOString(),
        propertyCount: file.processedRecords || 0,
        status,
        errorMessage: file.errorMessage,
      };
    });

    res.json(transformedFiles);
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

router.delete('/:fileId', optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    console.log(`[FILES] Delete request for fileId: ${fileId}`);

    // Try to find by id first (database primary key), then by fileId (unique identifier)
    let fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId }
    });

    if (!fileUpload) {
      // If not found by id, try by fileId
      fileUpload = await prisma.fileUpload.findUnique({
        where: { fileId }
      });
    }

    if (!fileUpload) {
      console.log(`[FILES] File not found: ${fileId}`);
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the file upload record using the database id
    await prisma.fileUpload.delete({
      where: { id: fileUpload.id }
    });

    const username = req.user?.username || 'anonymous';
    console.log(`[FILES] Deleted file upload: ${fileUpload.filename} (id: ${fileUpload.id}) by user ${username}`);

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
// GET /api/files/:fileId/status - Get file processing status
// ============================================================================

router.get('/:fileId/status', optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Try to find by id first (database primary key), then by fileId (unique identifier)
    let fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId }
    });

    if (!fileUpload) {
      // If not found by id, try by fileId
      fileUpload = await prisma.fileUpload.findUnique({
        where: { fileId }
      });
    }

    if (!fileUpload) {
      return res.status(404).json({ error: 'File upload not found' });
    }

    // Map database status to frontend status
    let status = fileUpload.status.toLowerCase();
    if (status === 'failed') status = 'error';

    res.json({
      id: fileUpload.id,
      fileId: fileUpload.fileId,
      filename: fileUpload.filename,
      status,
      processedRecords: fileUpload.processedRecords || 0,
      totalRecords: fileUpload.totalRecords || 0,
      uploadedAt: fileUpload.uploadedAt.toISOString(),
      processedAt: fileUpload.completedAt?.toISOString(),
      errorMessage: fileUpload.errorMessage,
    });
  } catch (error) {
    console.error('[FILES] Status error:', error);
    res.status(500).json({ error: 'Failed to get file status' });
  }
});

// ============================================================================
// POST /api/files/:fileId/reprocess - Reprocess a file
// ============================================================================

router.post('/:fileId/reprocess', optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    console.log(`[FILES] Reprocess request for fileId: ${fileId}`);

    // Try to find by id first (database primary key), then by fileId (unique identifier)
    let fileUpload = await prisma.fileUpload.findUnique({
      where: { id: fileId }
    });

    if (!fileUpload) {
      // If not found by id, try by fileId
      fileUpload = await prisma.fileUpload.findUnique({
        where: { fileId }
      });
    }

    if (!fileUpload) {
      console.log(`[FILES] File not found for reprocessing: ${fileId}`);
      return res.status(404).json({ error: 'File not found' });
    }

    // Mark file as processing again using the database id
    await prisma.fileUpload.update({
      where: { id: fileUpload.id },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
        processedRecords: 0,
        completedAt: null
      }
    });

    const username = req.user?.username || 'anonymous';
    console.log(`[FILES] Reprocessing file: ${fileUpload.filename} (id: ${fileUpload.id}) by user ${username}`);

    // Note: In a real implementation, you would trigger the actual file processing here
    // For now, we'll just mark it as processing
    res.json({
      success: true,
      message: 'File reprocessing started',
      fileId: fileUpload.fileId
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
