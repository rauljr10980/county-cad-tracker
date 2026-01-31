const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

/**
 * POST /api/foreclosure/upload
 * Upload and process foreclosure file
 */
router.post('/upload', async (req, res) => {
  try {
    const { filename, fileData, mode = 'standard' } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({
        success: false,
        error: 'Missing filename or file data',
      });
    }

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');

    // Parse file based on extension
    let jsonData;
    const fileExtension = filename.toLowerCase().split('.').pop();

    if (fileExtension === 'csv') {
      // Parse CSV
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // Parse Excel
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file format. Please upload .xlsx, .xls, or .csv files.',
      });
    }

    if (!jsonData || jsonData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'File is empty or contains no valid data',
      });
    }

    // Create a file upload record
    const fileId = `FC-${Date.now()}`;
    const fileUpload = await prisma.fileUpload.create({
      data: {
        filename,
        fileId,
        status: 'PROCESSING',
        totalRecords: jsonData.length,
        processedRecords: 0,
      },
    });

    // Process foreclosure records
    const processedRecords = [];
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];

      try {
        // Extract required fields based on mode
        const docNumber = String(
          row['Doc Number'] ||
            row['Document Number'] ||
            row['DocNumber'] ||
            row['doc_number'] ||
            ''
        ).trim();

        if (!docNumber) {
          errors.push({
            row: i + 1,
            error: 'Missing Document Number',
          });
          continue;
        }

        // Extract other fields
        const recordedDate = row['Recorded Date'] || row['RecordedDate'] || null;
        const saleDate = row['Sale Date'] || row['SaleDate'] || null;
        const remarks = row['Remarks'] || '';
        const type =
          row['Type'] ||
          row['type'] ||
          (mode === 'standard' ? 'Mortgage' : null);

        // Extract address fields
        let streetAddress, city, state, zipCode;

        if (row['Full Address'] || row['FullAddress']) {
          // Parse full address
          const fullAddress = String(row['Full Address'] || row['FullAddress']);
          const parts = fullAddress.split(',').map((p) => p.trim());

          if (parts.length >= 3) {
            streetAddress = parts[0];
            city = parts[1];
            // Last part should be "STATE ZIP"
            const stateZip = parts[parts.length - 1].split(' ');
            state = stateZip[0];
            zipCode = stateZip[1];
          }
        } else {
          // Use separate fields
          streetAddress =
            row['Street Address'] || row['Address'] || row['PropertyAddress'] || '';
          city = row['City'] || '';
          state = row['State'] || 'TEXAS';
          zipCode = row['Zip Code'] || row['ZIP'] || row['ZipCode'] || '';
        }

        // Filing month (optional, defaults to current month)
        const filingMonth = row['Filing Month'] || new Date().toISOString().slice(0, 7);

        const foreclosureData = {
          docNumber,
          recordedDate: recordedDate ? new Date(recordedDate) : null,
          saleDate: saleDate ? new Date(saleDate) : null,
          type,
          streetAddress,
          city,
          state,
          zipCode,
          remarks,
          filingMonth,
          uploadMode: mode,
          fileId,
        };

        processedRecords.push(foreclosureData);
      } catch (error) {
        errors.push({
          row: i + 1,
          error: error.message,
        });
      }
    }

    // Batch insert foreclosure records
    const BATCH_SIZE = 100;
    let insertedCount = 0;

    for (let i = 0; i < processedRecords.length; i += BATCH_SIZE) {
      const batch = processedRecords.slice(i, i + BATCH_SIZE);

      await prisma.foreclosure.createMany({
        data: batch,
        skipDuplicates: false,
      });

      insertedCount += batch.length;

      // Update progress
      await prisma.fileUpload.update({
        where: { id: fileUpload.id },
        data: { processedRecords: insertedCount },
      });
    }

    // Mark old records as inactive (records not in this upload)
    const uploadedDocNumbers = processedRecords.map((r) => r.docNumber);
    const inactivatedResult = await prisma.foreclosure.updateMany({
      where: {
        docNumber: {
          notIn: uploadedDocNumbers,
        },
        active: true,
      },
      data: {
        active: false,
      },
    });

    // Mark new records as active
    await prisma.foreclosure.updateMany({
      where: {
        docNumber: {
          in: uploadedDocNumbers,
        },
      },
      data: {
        active: true,
      },
    });

    // Count active and inactive records
    const activeCount = await prisma.foreclosure.count({
      where: { active: true },
    });

    const inactiveCount = await prisma.foreclosure.count({
      where: { active: false },
    });

    // Update file upload status
    await prisma.fileUpload.update({
      where: { id: fileUpload.id },
      data: {
        status: 'COMPLETED',
        processedRecords: insertedCount,
        errorCount: errors.length,
        completedAt: new Date(),
      },
    });

    res.json({
      success: true,
      fileId,
      recordsProcessed: insertedCount,
      totalRecords: jsonData.length,
      activeRecords: activeCount,
      inactiveRecords: inactiveCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Foreclosure upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload foreclosure file',
    });
  }
});

/**
 * GET /api/foreclosure
 * Get all foreclosure records
 */
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;

    const where = {};
    if (active !== undefined) {
      where.active = active === 'true';
    }

    const foreclosures = await prisma.foreclosure.findMany({
      where,
      orderBy: {
        saleDate: 'desc',
      },
    });

    res.json({
      success: true,
      data: foreclosures,
      count: foreclosures.length,
    });
  } catch (error) {
    console.error('Error fetching foreclosures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch foreclosures',
    });
  }
});

/**
 * DELETE /api/foreclosure
 * Delete all foreclosure records
 */
router.delete('/', async (req, res) => {
  try {
    const result = await prisma.foreclosure.deleteMany({});

    res.json({
      success: true,
      message: `Deleted ${result.count} foreclosure records`,
    });
  } catch (error) {
    console.error('Error deleting foreclosures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete foreclosures',
    });
  }
});

module.exports = router;