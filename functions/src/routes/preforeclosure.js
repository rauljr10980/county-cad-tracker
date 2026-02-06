/**
 * Pre-Foreclosure Management Routes
 * Handle pre-foreclosure file uploads and record management
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const XLSX = require('xlsx');

const { parseFullAddress, normalizeAddress } = require('../lib/addressParser');
const { batchGeocodeCensus, batchGeocodeNominatim, batchGeocodeArcGIS } = require('../lib/censusGeocode');
// Owner lookup uses direct HTTP POST to bexar.acttax.com (no Puppeteer/n8n needed)
const { scrapeBexarForeclosures } = require('../lib/bexarScraper');

const router = express.Router();

// ============================================================================
// GET ALL PRE-FORECLOSURE RECORDS
// ============================================================================

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { address, city, zip } = req.query;
    
    // Build where clause for filtering
    const where = {};
    if (address) {
      where.address = { contains: address, mode: 'insensitive' };
    }
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }
    if (zip) {
      where.zip = zip;
    }

    const records = await prisma.preForeclosure.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' }
    });

    // Map database format to frontend format
    const mappedRecords = records.map(record => ({
      document_number: record.documentNumber,
      type: record.type,
      address: record.address,
      city: record.city,
      zip: record.zip,
      filing_month: record.filingMonth,
      county: record.county,
      latitude: record.latitude,
      longitude: record.longitude,
      school_district: record.schoolDistrict,
      recorded_date: record.recordedDate ? record.recordedDate.toISOString() : null,
      sale_date: record.saleDate ? record.saleDate.toISOString() : null,
      internal_status: record.internalStatus,
      notes: record.notes,
      phoneNumbers: record.phoneNumbers || [],
      ownerPhoneIndex: record.ownerPhoneIndex,
      last_action_date: record.lastActionDate ? record.lastActionDate.toISOString() : null,
      next_follow_up_date: record.nextFollowUpDate ? record.nextFollowUpDate.toISOString() : null,
      actionType: record.actionType ? record.actionType.toLowerCase() : undefined,
      priority: record.priority ? record.priority.toLowerCase() : undefined,
      dueTime: record.dueTime ? record.dueTime.toISOString() : undefined,
      assignedTo: record.assignedTo,
      inactive: record.inactive,
      visited: record.visited,
      visited_at: record.visitedAt ? record.visitedAt.toISOString() : null,
      visited_by: record.visitedBy,
      workflow_stage: record.workflowStage || 'not_started',
      workflow_log: record.workflowLog || [],
      first_seen_month: record.firstSeenMonth,
      last_seen_month: record.lastSeenMonth,
      is_returning: record.isReturning || false,
      previous_document_numbers: record.previousDocumentNumbers || [],
      ownerName: record.ownerName,
      ownerAddress: record.ownerAddress,
      emails: record.emails || [],
      ownerLookupAt: record.ownerLookupAt ? record.ownerLookupAt.toISOString() : null,
      ownerLookupStatus: record.ownerLookupStatus,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    }));

    res.json(mappedRecords);
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pre-foreclosure records' });
  }
});

// ============================================================================
// UPLOAD PRE-FORECLOSURE FILE
// ============================================================================

router.post('/upload', optionalAuth, async (req, res) => {
  try {
    const { filename, fileData } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');
    
    // Parse Excel/CSV file
    let workbook;
    try {
      // Try to detect if it's CSV or Excel
      const isCSV = filename.toLowerCase().endsWith('.csv');
      if (isCSV) {
        // For CSV, read as string first
        const csvString = buffer.toString('utf-8');
        workbook = XLSX.read(csvString, { type: 'string' });
      } else {
        // For Excel files, read as buffer
        workbook = XLSX.read(buffer, { type: 'buffer' });
      }
    } catch (parseError) {
      console.error('[PRE-FORECLOSURE] Parse error:', parseError);
      return res.status(400).json({ error: 'Invalid file format. Please upload a valid Excel or CSV file.' });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'File has no sheets' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'File is empty or has no data rows' });
    }

    // Get current month for default filing month
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Process records
    const processedRecords = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Get column names from the row (handle case-insensitive matching)
        const rowKeys = Object.keys(row);
        
        // Find document number field - exact match first, then case-insensitive
        let documentNumber = row['Doc Number'] || row['Document Number'] || row['doc number'] || row['document_number'];
        if (!documentNumber) {
          const docKey = rowKeys.find(key => 
            key.toLowerCase().replace(/\s+/g, ' ') === 'doc number' ||
            key.toLowerCase().replace(/\s+/g, ' ') === 'document number'
          );
          documentNumber = docKey ? row[docKey] : null;
        }
        
        if (!documentNumber) {
          errors.push(`Row ${i + 2}: Missing document number`);
          continue;
        }

        // Find type field - exact match first, then case-insensitive
        let type = row['Type'] || row['type'] || row['TYPE'];
        if (!type) {
          const typeKey = rowKeys.find(key => key.toLowerCase() === 'type');
          type = typeKey ? row[typeKey] : null;
        }

        // Type is optional - default to "Mortgage" if not provided
        if (type) {
          type = String(type).trim().toUpperCase();
          if (type !== 'MORTGAGE' && type !== 'TAX') {
            errors.push(`Row ${i + 2}: Invalid type "${type}" (must be MORTGAGE or TAX)`);
            continue;
          }
          // Convert to proper case: MORTGAGE -> Mortgage, TAX -> Tax
          type = type.charAt(0) + type.slice(1).toLowerCase();
        } else {
          type = 'Mortgage';
        }

        // Find address fields - exact match first, then case-insensitive
        let address = row['Address'] || row['address'] || row['ADDRESS'];
        if (!address) {
          const addrKey = rowKeys.find(key => key.toLowerCase() === 'address');
          address = addrKey ? row[addrKey] : '';
        }

        let city = row['City'] || row['city'] || row['CITY'];
        if (!city) {
          const cityKey = rowKeys.find(key => key.toLowerCase() === 'city');
          city = cityKey ? row[cityKey] : '';
        }

        let zip = row['ZIP'] || row['zip'] || row['Zip'] || row['ZIP Code'] || row['zip code'];
        if (!zip) {
          const zipKey = rowKeys.find(key =>
            key.toLowerCase() === 'zip' ||
            key.toLowerCase() === 'zip code' ||
            key.toLowerCase() === 'zipcode'
          );
          zip = zipKey ? row[zipKey] : '';
        }

        // Support "Full Address" column - parse into address, city, zip
        // Format: "231 BEAM, SAN ANTONIO, TEXAS, 78221"
        if (!address) {
          let fullAddress = row['Full Address'] || row['full address'] || row['FULL ADDRESS'];
          if (!fullAddress) {
            const fullAddrKey = rowKeys.find(key => key.toLowerCase().replace(/\s+/g, ' ') === 'full address');
            fullAddress = fullAddrKey ? row[fullAddrKey] : null;
          }
          if (fullAddress) {
            const parts = String(fullAddress).split(',').map(p => p.trim());
            if (parts.length >= 1) address = parts[0]; // Street address
            if (parts.length >= 2) city = parts[1]; // City
            // Skip state (parts[2] if present), grab zip from last part
            const lastPart = parts[parts.length - 1];
            const zipMatch = lastPart ? lastPart.match(/\d{5}/) : null;
            if (zipMatch) zip = zipMatch[0];
          }
        }

        // Parse Recorded Date (optional)
        let recordedDate = row['Recorded Date'] || row['recorded date'] || row['RECORDED DATE'] || row['Recorded'];
        if (!recordedDate) {
          const rdKey = rowKeys.find(key => key.toLowerCase().replace(/\s+/g, ' ').includes('recorded'));
          recordedDate = rdKey ? row[rdKey] : null;
        }
        if (recordedDate) {
          const parsed = new Date(String(recordedDate).trim());
          recordedDate = isNaN(parsed.getTime()) ? null : parsed;
        }

        // Parse Sale Date (optional)
        let saleDate = row['Sale Date'] || row['sale date'] || row['SALE DATE'];
        if (!saleDate) {
          const sdKey = rowKeys.find(key => key.toLowerCase().replace(/\s+/g, ' ') === 'sale date');
          saleDate = sdKey ? row[sdKey] : null;
        }
        if (saleDate) {
          const parsed = new Date(String(saleDate).trim());
          saleDate = isNaN(parsed.getTime()) ? null : parsed;
        }
        
        // Filing Month is optional - default to current month
        let filingMonth = row['Filing Month'] || row['Filing Month'] || row['filing_month'] || row['FilingMonth'];
        if (!filingMonth) {
          const filingKey = rowKeys.find(key => 
            key.toLowerCase().includes('filing') && key.toLowerCase().includes('month')
          );
          filingMonth = filingKey ? row[filingKey] : currentMonth;
        }
        if (!filingMonth) filingMonth = currentMonth;
        
        // County is optional - default to Bexar
        let county = row['County'] || row['county'] || row['COUNTY'] || 'Bexar';
        if (!county) {
          const countyKey = rowKeys.find(key => key.toLowerCase() === 'county');
          county = countyKey ? row[countyKey] : 'Bexar';
        }
        if (!county) county = 'Bexar';

        if (!address) {
          errors.push(`Row ${i + 2}: Missing address`);
          continue;
        }

        // Parse latitude and longitude (optional)
        let latitude = row['Lat'] || row['lat'] || row['Latitude'] || row['latitude'] || row['LAT'];
        let longitude = row['Long'] || row['long'] || row['Longitude'] || row['longitude'] || row['LONG'];
        if (!latitude) {
          const latKey = rowKeys.find(key => key.toLowerCase() === 'lat' || key.toLowerCase() === 'latitude');
          latitude = latKey ? row[latKey] : null;
        }
        if (!longitude) {
          const longKey = rowKeys.find(key => key.toLowerCase() === 'long' || key.toLowerCase() === 'longitude');
          longitude = longKey ? row[longKey] : null;
        }

        // Parse school district (optional)
        let schoolDistrict = row['School District'] || row['school district'] || row['SchoolDistrict'] || row['school_district'];
        if (!schoolDistrict) {
          const schoolKey = rowKeys.find(key => 
            key.toLowerCase().includes('school') && key.toLowerCase().includes('district')
          );
          schoolDistrict = schoolKey ? row[schoolKey] : null;
        }

        processedRecords.push({
          documentNumber: String(documentNumber).trim(),
          type: type,
          address: String(address).trim(),
          city: String(city || '').trim(),
          zip: String(zip || '').trim(),
          filingMonth: String(filingMonth).trim(),
          county: String(county).trim(),
          latitude: latitude ? parseFloat(String(latitude).trim()) : null,
          longitude: longitude ? parseFloat(String(longitude).trim()) : null,
          schoolDistrict: schoolDistrict ? String(schoolDistrict).trim() : null,
          recordedDate: recordedDate || null,
          saleDate: saleDate || null,
        });
      } catch (rowError) {
        errors.push(`Row ${i + 2}: ${rowError.message}`);
      }
    }

    if (processedRecords.length === 0) {
      return res.status(400).json({ 
        error: 'No valid records found in file',
        errors: errors.slice(0, 10) // Return first 10 errors
      });
    }

    // Geocode records that don't already have coordinates
    const recordsToGeocode = processedRecords.filter(r => !r.latitude || !r.longitude);
    let geocodeResults = new Map();
    if (recordsToGeocode.length > 0) {
      const geocodeInputs = recordsToGeocode.map(r => ({
        id: r.documentNumber,
        street: r.address,
        city: r.city,
        state: 'TX',
        zip: r.zip,
      }));

      // Phase 1: Census batch geocoding (fast, handles most addresses)
      try {
        geocodeResults = await batchGeocodeCensus(geocodeInputs);
        console.log(`[PRE-FORECLOSURE] Census geocoded ${geocodeResults.size}/${recordsToGeocode.length} addresses`);
      } catch (geoError) {
        console.error('[PRE-FORECLOSURE] Census geocoding error:', geoError);
      }

      // Phase 2: Nominatim fallback for addresses Census couldn't match
      const censusFailed = geocodeInputs.filter(a => !geocodeResults.has(a.id));
      if (censusFailed.length > 0) {
        try {
          console.log(`[PRE-FORECLOSURE] Trying Nominatim for ${censusFailed.length} addresses Census missed`);
          const nominatimResults = await batchGeocodeNominatim(censusFailed);
          for (const [id, result] of nominatimResults) {
            geocodeResults.set(id, result);
          }
          console.log(`[PRE-FORECLOSURE] Nominatim recovered ${nominatimResults.size}/${censusFailed.length} addresses`);
        } catch (nomError) {
          console.error('[PRE-FORECLOSURE] Nominatim geocoding error:', nomError);
        }
      }

      console.log(`[PRE-FORECLOSURE] Total geocoded: ${geocodeResults.size}/${recordsToGeocode.length}`);
    }

    // Get all existing records with address and user-entered data for matching
    const existingRecords = await prisma.preForeclosure.findMany({
      select: {
        id: true,
        documentNumber: true,
        address: true,
        city: true,
        zip: true,
        previousDocumentNumbers: true,
        notes: true,
        phoneNumbers: true,
        ownerPhoneIndex: true,
        workflowStage: true,
        workflowLog: true,
        internalStatus: true,
        assignedTo: true,
        actionType: true,
        priority: true,
        lastActionDate: true,
        nextFollowUpDate: true,
        dueTime: true,
        visited: true,
        visitedAt: true,
        visitedBy: true,
        firstSeenMonth: true,
      }
    });
    const existingDocNumbers = new Set(existingRecords.map(r => r.documentNumber));

    // Build address lookup map for address-based matching
    const addressMap = new Map();
    for (const rec of existingRecords) {
      const key = normalizeAddress(rec.address, rec.city, rec.zip);
      if (key && key !== '||') {
        addressMap.set(key, rec);
      }
    }

    // Mark missing records as inactive
    const uploadedDocNumbers = new Set(processedRecords.map(r => r.documentNumber));
    const missingDocNumbers = Array.from(existingDocNumbers).filter(doc => !uploadedDocNumbers.has(doc));

    if (missingDocNumbers.length > 0) {
      await prisma.preForeclosure.updateMany({
        where: {
          documentNumber: { in: missingDocNumbers }
        },
        data: {
          inactive: true,
          updatedAt: new Date()
        }
      });
    }

    // Upsert records (create or update)
    let created = 0;
    let updated = 0;
    let addressMatched = 0;
    const dbErrors = [];
    const newDocNumbers = [];
    const updatedDocNumbers = [];
    const addressMatchedDocNumbers = [];

    for (const record of processedRecords) {
      try {
        // Apply geocode results if the record doesn't have coordinates
        const geoResult = geocodeResults.get(record.documentNumber);
        const latitude = record.latitude || (geoResult ? geoResult.latitude : null);
        const longitude = record.longitude || (geoResult ? geoResult.longitude : null);

        const existing = await prisma.preForeclosure.findUnique({
          where: { documentNumber: record.documentNumber }
        });

        if (existing) {
          // Case 1: Same document number exists - update filing data
          const updateData = {
            type: record.type,
            address: record.address,
            city: record.city,
            zip: record.zip,
            filingMonth: record.filingMonth,
            county: record.county,
            latitude,
            longitude,
            schoolDistrict: record.schoolDistrict,
            inactive: false,
            lastSeenMonth: currentMonth,
            updatedAt: new Date()
          };
          if (record.recordedDate) updateData.recordedDate = record.recordedDate;
          if (record.saleDate) updateData.saleDate = record.saleDate;
          await prisma.preForeclosure.update({
            where: { documentNumber: record.documentNumber },
            data: updateData
          });
          updated++;
          updatedDocNumbers.push(record.documentNumber);
        } else {
          // Case 2: New document number - check address match
          const addrKey = normalizeAddress(record.address, record.city, record.zip);
          const addrMatch = addrKey && addrKey !== '||' ? addressMap.get(addrKey) : null;

          if (addrMatch) {
            // Case 2a: Address matches existing record with different doc number
            // Update existing row in-place: swap doc number, preserve user data
            const prevDocNumbers = Array.isArray(addrMatch.previousDocumentNumbers)
              ? [...addrMatch.previousDocumentNumbers, addrMatch.documentNumber]
              : [addrMatch.documentNumber];

            const updateData = {
              documentNumber: record.documentNumber,
              type: record.type,
              address: record.address,
              city: record.city,
              zip: record.zip,
              filingMonth: record.filingMonth,
              county: record.county,
              latitude,
              longitude,
              schoolDistrict: record.schoolDistrict,
              inactive: false,
              lastSeenMonth: currentMonth,
              isReturning: true,
              previousDocumentNumbers: prevDocNumbers,
              updatedAt: new Date()
            };
            if (record.recordedDate) updateData.recordedDate = record.recordedDate;
            if (record.saleDate) updateData.saleDate = record.saleDate;

            await prisma.preForeclosure.update({
              where: { id: addrMatch.id },
              data: updateData
            });

            // Update maps so subsequent rows can't double-match
            addressMap.set(addrKey, { ...addrMatch, documentNumber: record.documentNumber });
            existingDocNumbers.delete(addrMatch.documentNumber);
            existingDocNumbers.add(record.documentNumber);

            addressMatched++;
            addressMatchedDocNumbers.push(record.documentNumber);
            console.log(`[PRE-FORECLOSURE] Address match: ${addrMatch.documentNumber} -> ${record.documentNumber} at "${record.address}, ${record.city} ${record.zip}"`);
          } else {
            // Case 2b: Truly new record
            const createData = {
              documentNumber: record.documentNumber,
              type: record.type,
              address: record.address,
              city: record.city,
              zip: record.zip,
              filingMonth: record.filingMonth,
              county: record.county,
              latitude,
              longitude,
              schoolDistrict: record.schoolDistrict,
              internalStatus: 'New',
              inactive: false,
              firstSeenMonth: currentMonth,
              lastSeenMonth: currentMonth
            };
            if (record.recordedDate) createData.recordedDate = record.recordedDate;
            if (record.saleDate) createData.saleDate = record.saleDate;
            await prisma.preForeclosure.create({
              data: createData
            });
            created++;
            newDocNumbers.push(record.documentNumber);
          }
        }
      } catch (dbError) {
        console.error(`[PRE-FORECLOSURE] Database error for record ${record.documentNumber}:`, dbError);
        dbErrors.push(`Failed to save record ${record.documentNumber}: ${dbError.message}`);
      }
    }

    if (created === 0 && updated === 0 && addressMatched === 0 && dbErrors.length > 0) {
      return res.status(500).json({
        error: 'Failed to save records to database',
        errors: dbErrors.slice(0, 10)
      });
    }

    // Get counts
    const totalRecords = await prisma.preForeclosure.count();
    const activeRecords = await prisma.preForeclosure.count({ where: { inactive: false } });
    const inactiveRecords = await prisma.preForeclosure.count({ where: { inactive: true } });

    // Save upload history for comparison reports
    try {
      await prisma.preForeclosureUploadHistory.create({
        data: {
          filename,
          uploadedBy: req.user?.username || 'System',
          recordsProcessed: processedRecords.length,
          newRecords: created,
          updatedRecords: updated + addressMatched,
          inactiveRecords: missingDocNumbers.length,
          totalRecords,
          activeRecords,
          success: true,
          newDocumentNumbers: newDocNumbers,
          updatedDocumentNumbers: [...updatedDocNumbers, ...addressMatchedDocNumbers],
          inactiveDocumentNumbers: missingDocNumbers
        }
      });
    } catch (historyError) {
      console.error('[PRE-FORECLOSURE] Failed to save upload history:', historyError);
    }

    console.log(`[PRE-FORECLOSURE] Upload complete: ${created} created, ${updated} updated, ${addressMatched} address-matched, ${processedRecords.length} processed`);

    res.json({
      success: true,
      fileId: filename,
      recordsProcessed: processedRecords.length,
      totalRecords,
      activeRecords,
      inactiveRecords,
      created,
      updated,
      addressMatched,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      dbErrors: dbErrors.length > 0 ? dbErrors.slice(0, 10) : undefined
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Upload error:', error);
    console.error('[PRE-FORECLOSURE] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process pre-foreclosure file',
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// ============================================================================
// UPLOAD ADDRESS-ONLY PRE-FORECLOSURE FILE
// ============================================================================

router.post('/upload-address-only', optionalAuth, async (req, res) => {
  try {
    const { filename, fileData, type } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    if (!type || (type !== 'Mortgage' && type !== 'Tax')) {
      return res.status(400).json({ error: 'Type must be "Mortgage" or "Tax"' });
    }

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');

    // Parse Excel/CSV file
    let workbook;
    try {
      const isCSV = filename.toLowerCase().endsWith('.csv');
      if (isCSV) {
        const csvString = buffer.toString('utf-8');
        workbook = XLSX.read(csvString, { type: 'string' });
      } else {
        workbook = XLSX.read(buffer, { type: 'buffer' });
      }
    } catch (parseError) {
      console.error('[PRE-FORECLOSURE] Parse error:', parseError);
      return res.status(400).json({ error: 'Invalid file format. Please upload a valid Excel or CSV file.' });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'File has no sheets' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'File is empty or has no data rows' });
    }

    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Process records - expect a single "Address" column
    const processedRecords = [];
    const geocodeInputs = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowKeys = Object.keys(row);

      // Find address field (case-insensitive, supports "Address" and "Full Address")
      let fullAddress = row['Full Address'] || row['full address'] || row['FULL ADDRESS'] ||
        row['Address'] || row['address'] || row['ADDRESS'];
      if (!fullAddress) {
        const addrKey = rowKeys.find(k => {
          const lower = k.toLowerCase().trim();
          return lower === 'full address' || lower === 'address';
        });
        fullAddress = addrKey ? row[addrKey] : null;
      }

      if (!fullAddress || String(fullAddress).trim() === '') {
        errors.push(`Row ${i + 2}: Missing or empty address`);
        continue;
      }

      // Find date fields (optional)
      let recordedDate = row['Recorded Date'] || row['recorded date'] || row['RECORDED DATE'] || row['RecordedDate'];
      if (!recordedDate) {
        const rdKey = rowKeys.find(k => k.toLowerCase().trim() === 'recorded date' || k.toLowerCase().trim() === 'recordeddate');
        recordedDate = rdKey ? row[rdKey] : null;
      }

      let saleDate = row['Sale Date'] || row['sale date'] || row['SALE DATE'] || row['SaleDate'];
      if (!saleDate) {
        const sdKey = rowKeys.find(k => k.toLowerCase().trim() === 'sale date' || k.toLowerCase().trim() === 'saledate');
        saleDate = sdKey ? row[sdKey] : null;
      }

      // Parse dates
      let parsedRecordedDate = null;
      if (recordedDate) {
        const d = new Date(String(recordedDate).trim());
        if (!isNaN(d.getTime())) parsedRecordedDate = d;
      }

      let parsedSaleDate = null;
      if (saleDate) {
        const d = new Date(String(saleDate).trim());
        if (!isNaN(d.getTime())) parsedSaleDate = d;
      }

      const rowNumber = i + 1;
      const docNumber = `ADDR-${rowNumber}`;
      const parsed = parseFullAddress(String(fullAddress).trim());

      processedRecords.push({
        documentNumber: docNumber,
        type: type,
        address: parsed.street || parsed.raw,
        city: parsed.city || '',
        zip: parsed.zip || '',
        filingMonth: currentMonth,
        county: 'Bexar',
        recordedDate: parsedRecordedDate,
        saleDate: parsedSaleDate,
      });

      geocodeInputs.push({
        id: docNumber,
        street: parsed.street || parsed.raw,
        city: parsed.city || '',
        state: parsed.state || 'TX',
        zip: parsed.zip || '',
      });
    }

    if (processedRecords.length === 0) {
      return res.status(400).json({
        error: 'No valid addresses found in file. Make sure you have an "Address" column.',
        errors: errors.slice(0, 10),
      });
    }

    // Batch geocode via Census API
    let geocodeResults = new Map();
    try {
      geocodeResults = await batchGeocodeCensus(geocodeInputs);
      console.log(`[PRE-FORECLOSURE] Census geocoding: ${geocodeResults.size}/${geocodeInputs.length} matched`);
    } catch (geoError) {
      console.error('[PRE-FORECLOSURE] Census geocoding error:', geoError);
      // Continue without coordinates
    }

    // Upsert records (no inactive marking for address-only uploads)
    let created = 0;
    let updated = 0;
    const dbErrors = [];
    const newDocNumbers = [];
    const updatedDocNumbers = [];

    for (const record of processedRecords) {
      try {
        const geoResult = geocodeResults.get(record.documentNumber);
        const latitude = geoResult?.latitude || null;
        const longitude = geoResult?.longitude || null;

        const existing = await prisma.preForeclosure.findUnique({
          where: { documentNumber: record.documentNumber }
        });

        if (existing) {
          await prisma.preForeclosure.update({
            where: { documentNumber: record.documentNumber },
            data: {
              type: record.type,
              address: record.address,
              city: record.city,
              zip: record.zip,
              filingMonth: record.filingMonth,
              county: record.county,
              latitude,
              longitude,
              recordedDate: record.recordedDate,
              saleDate: record.saleDate,
              inactive: false,
              lastSeenMonth: currentMonth,
              updatedAt: new Date(),
            }
          });
          updated++;
          updatedDocNumbers.push(record.documentNumber);
        } else {
          await prisma.preForeclosure.create({
            data: {
              documentNumber: record.documentNumber,
              type: record.type,
              address: record.address,
              city: record.city,
              zip: record.zip,
              filingMonth: record.filingMonth,
              county: record.county,
              latitude,
              longitude,
              recordedDate: record.recordedDate,
              saleDate: record.saleDate,
              internalStatus: 'New',
              inactive: false,
              firstSeenMonth: currentMonth,
              lastSeenMonth: currentMonth,
            }
          });
          created++;
          newDocNumbers.push(record.documentNumber);
        }
      } catch (dbError) {
        console.error(`[PRE-FORECLOSURE] Database error for record ${record.documentNumber}:`, dbError);
        dbErrors.push(`Failed to save record ${record.documentNumber}: ${dbError.message}`);
      }
    }

    if (created === 0 && updated === 0 && dbErrors.length > 0) {
      return res.status(500).json({
        error: 'Failed to save records to database',
        errors: dbErrors.slice(0, 10),
      });
    }

    // Get counts
    const totalRecords = await prisma.preForeclosure.count();
    const activeRecords = await prisma.preForeclosure.count({ where: { inactive: false } });
    const inactiveRecords = await prisma.preForeclosure.count({ where: { inactive: true } });

    // Save upload history
    try {
      await prisma.preForeclosureUploadHistory.create({
        data: {
          filename,
          uploadedBy: req.user?.username || 'System',
          recordsProcessed: processedRecords.length,
          newRecords: created,
          updatedRecords: updated,
          inactiveRecords: 0,
          totalRecords,
          activeRecords,
          success: true,
          newDocumentNumbers: newDocNumbers,
          updatedDocumentNumbers: updatedDocNumbers,
          inactiveDocumentNumbers: [],
        }
      });
    } catch (historyError) {
      console.error('[PRE-FORECLOSURE] Failed to save upload history:', historyError);
    }

    console.log(`[PRE-FORECLOSURE] Address-only upload complete: ${created} created, ${updated} updated, ${geocodeResults.size} geocoded`);

    res.json({
      success: true,
      fileId: filename,
      recordsProcessed: processedRecords.length,
      created,
      updated,
      geocoded: geocodeResults.size,
      totalRecords,
      activeRecords,
      inactiveRecords,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      dbErrors: dbErrors.length > 0 ? dbErrors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Address-only upload error:', error);
    console.error('[PRE-FORECLOSURE] Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to process address-only upload',
      details: error.message,
    });
  }
});

// ============================================================================
// GEOCODE RECORDS (Census → Nominatim → ArcGIS)
// ============================================================================

router.post('/geocode', optionalAuth, async (req, res) => {
  try {
    const { documentNumbers } = req.body;

    if (!documentNumbers || !Array.isArray(documentNumbers) || documentNumbers.length === 0) {
      return res.status(400).json({ error: 'documentNumbers array is required' });
    }

    // Fetch the records from DB
    const records = await prisma.preForeclosure.findMany({
      where: { documentNumber: { in: documentNumbers } },
      select: {
        documentNumber: true,
        address: true,
        city: true,
        zip: true,
        latitude: true,
        longitude: true,
      }
    });

    if (records.length === 0) {
      return res.status(404).json({ error: 'No matching records found' });
    }

    const geocodeInputs = records.map(r => ({
      id: r.documentNumber,
      street: r.address,
      city: r.city,
      state: 'TX',
      zip: r.zip,
    }));

    const allResults = new Map();

    // Phase 1: Census batch API
    try {
      const censusResults = await batchGeocodeCensus(geocodeInputs);
      for (const [id, result] of censusResults) allResults.set(id, { ...result, source: 'census' });
      console.log(`[GEOCODE] Census: ${censusResults.size}/${geocodeInputs.length}`);
    } catch (err) {
      console.error('[GEOCODE] Census error:', err);
    }

    // Phase 2: Nominatim for Census failures
    const afterCensus = geocodeInputs.filter(a => !allResults.has(a.id));
    if (afterCensus.length > 0) {
      try {
        const nomResults = await batchGeocodeNominatim(afterCensus);
        for (const [id, result] of nomResults) allResults.set(id, { ...result, source: 'nominatim' });
        console.log(`[GEOCODE] Nominatim: ${nomResults.size}/${afterCensus.length}`);
      } catch (err) {
        console.error('[GEOCODE] Nominatim error:', err);
      }
    }

    // Phase 3: ArcGIS for remaining failures (uses TomTom/HERE data — covers new subdivisions)
    const afterNominatim = geocodeInputs.filter(a => !allResults.has(a.id));
    if (afterNominatim.length > 0) {
      try {
        const arcResults = await batchGeocodeArcGIS(afterNominatim);
        for (const [id, result] of arcResults) allResults.set(id, { ...result, source: 'arcgis' });
        console.log(`[GEOCODE] ArcGIS: ${arcResults.size}/${afterNominatim.length}`);
      } catch (err) {
        console.error('[GEOCODE] ArcGIS error:', err);
      }
    }

    // Update DB with results
    let updated = 0;
    for (const [documentNumber, result] of allResults) {
      try {
        await prisma.preForeclosure.update({
          where: { documentNumber },
          data: {
            latitude: result.latitude,
            longitude: result.longitude,
            updatedAt: new Date(),
          }
        });
        updated++;
      } catch (err) {
        console.error(`[GEOCODE] DB update error for ${documentNumber}:`, err);
      }
    }

    const failed = records.length - allResults.size;
    console.log(`[GEOCODE] Complete: ${updated} updated, ${failed} failed out of ${records.length}`);

    res.json({
      success: true,
      total: records.length,
      geocoded: allResults.size,
      updated,
      failed,
      sources: {
        census: [...allResults.values()].filter(r => r.source === 'census').length,
        nominatim: [...allResults.values()].filter(r => r.source === 'nominatim').length,
        arcgis: [...allResults.values()].filter(r => r.source === 'arcgis').length,
      },
    });
  } catch (error) {
    console.error('[GEOCODE] Error:', error);
    res.status(500).json({ error: 'Geocoding failed', message: error.message });
  }
});

// ============================================================================
// OWNER LOOKUP via Bexar County Tax Assessor (direct HTTP POST)
// ============================================================================

// Helper: look up owner from bexar.acttax.com
async function lookupOwnerFromTaxAssessor(address) {
  const searchAddress = address.toUpperCase().trim();
  console.log(`[OWNER-LOOKUP] Searching tax assessor for "${searchAddress}"`);

  const response = await fetch('https://bexar.acttax.com/act_webdev/bexar/showlist.jsp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `searchby=6&criteria=${encodeURIComponent(searchAddress)}&subcriteria=`,
  });

  if (!response.ok) {
    throw new Error(`Tax assessor returned ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Parse owner from HTML: <td class="owner-responsive">OWNER NAME<br>STREET<br>CITY, STATE  ZIP</td>
  const ownerMatch = html.match(/<td class="owner-responsive"[^>]*>(?:<!--[^>]*-->\s*)?([\s\S]*?)\s*<\/td>/);
  if (!ownerMatch) {
    return { ownerName: null, ownerAddress: null, error: 'No results found' };
  }

  const parts = ownerMatch[1].split(/<br\s*\/?>/).map(s => s.trim()).filter(Boolean);
  const ownerName = parts[0] || null;
  const ownerAddress = parts.slice(1).join(', ') || null;

  console.log(`[OWNER-LOOKUP] Found: "${ownerName}" at "${ownerAddress}"`);
  return { ownerName, ownerAddress };
}

router.post('/:documentNumber/owner-lookup', optionalAuth, async (req, res) => {
  try {
    const { documentNumber } = req.params;

    const record = await prisma.preForeclosure.findUnique({
      where: { documentNumber },
    });

    if (!record) {
      return res.status(404).json({ error: 'Pre-foreclosure record not found' });
    }

    // Mark as pending
    await prisma.preForeclosure.update({
      where: { documentNumber },
      data: { ownerLookupStatus: 'pending', ownerLookupAt: new Date() },
    });

    console.log(`[OWNER-LOOKUP] Starting lookup for ${documentNumber} at "${record.address}"`);

    // Call tax assessor directly
    const result = await lookupOwnerFromTaxAssessor(record.address);

    const ownerName = result.ownerName?.trim();
    if (!ownerName || ownerName.length < 3) {
      await prisma.preForeclosure.update({
        where: { documentNumber },
        data: { ownerLookupStatus: 'failed', ownerLookupAt: new Date() },
      });
      return res.json({
        success: false,
        error: result.error || 'No owner found',
      });
    }

    // Save owner data
    const ownerAddress = result.ownerAddress?.trim() || null;
    const updated = await prisma.preForeclosure.update({
      where: { documentNumber },
      data: {
        ownerName,
        ownerAddress,
        ownerLookupStatus: 'success',
        ownerLookupAt: new Date(),
      },
    });

    console.log(`[OWNER-LOOKUP] Found: "${ownerName}" at "${ownerAddress}"`);

    res.json({
      success: true,
      partial: false,
      ownerName: updated.ownerName,
      ownerAddress: updated.ownerAddress,
      emails: updated.emails || [],
      phoneNumbers: updated.phoneNumbers || [],
      ownerPhoneIndex: updated.ownerPhoneIndex,
    });
  } catch (error) {
    console.error('[OWNER-LOOKUP] Error:', error);
    res.status(500).json({
      error: 'Owner lookup failed',
      details: error.message,
    });
  }
});

// ============================================================================
// BATCH OWNER LOOKUP (runs sequentially for all records without owner)
// ============================================================================

router.post('/batch-owner-lookup', optionalAuth, async (req, res) => {
  try {
    // Find all active records that have an address but no ownerName
    const records = await prisma.preForeclosure.findMany({
      where: {
        address: { not: '' },
        ownerName: null,
        inactive: { not: true },
      },
      select: {
        documentNumber: true,
        address: true,
        city: true,
        zip: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (records.length === 0) {
      return res.json({
        success: true,
        message: 'All records already have owner names',
        total: 0,
        found: 0,
        failed: 0,
      });
    }

    console.log(`[BATCH-OWNER] Starting batch lookup for ${records.length} records`);

    let found = 0;
    let failed = 0;
    const results = [];

    for (const record of records) {
      try {
        console.log(`[BATCH-OWNER] Looking up: ${record.documentNumber} - "${record.address}"`);

        const lookupResult = await lookupOwnerFromTaxAssessor(record.address);

        const ownerName = lookupResult.ownerName?.trim();
        if (ownerName && ownerName.length >= 3) {
          await prisma.preForeclosure.update({
            where: { documentNumber: record.documentNumber },
            data: {
              ownerName,
              ownerAddress: lookupResult.ownerAddress?.trim() || null,
              ownerLookupStatus: 'success',
              ownerLookupAt: new Date(),
            },
          });
          found++;
          results.push({ documentNumber: record.documentNumber, ownerName, status: 'found' });
          console.log(`[BATCH-OWNER] Found: ${record.documentNumber} -> "${ownerName}"`);
        } else {
          await prisma.preForeclosure.update({
            where: { documentNumber: record.documentNumber },
            data: {
              ownerLookupStatus: 'failed',
              ownerLookupAt: new Date(),
            },
          });
          failed++;
          results.push({ documentNumber: record.documentNumber, status: 'failed', error: lookupResult.error });
          console.log(`[BATCH-OWNER] Failed: ${record.documentNumber} - ${lookupResult.error || 'no owner found'}`);
        }

        // 2 second delay between lookups
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        failed++;
        results.push({ documentNumber: record.documentNumber, status: 'error', error: err.message });
        console.error(`[BATCH-OWNER] Error for ${record.documentNumber}:`, err.message);
      }
    }

    console.log(`[BATCH-OWNER] Complete: ${found} found, ${failed} failed out of ${records.length}`);

    res.json({
      success: true,
      total: records.length,
      found,
      failed,
      results,
    });
  } catch (error) {
    console.error('[BATCH-OWNER] Error:', error);
    res.status(500).json({
      error: 'Batch owner lookup failed',
      details: error.message,
    });
  }
});

// ============================================================================
// UPDATE PRE-FORECLOSURE RECORD
// ============================================================================

router.put('/:documentNumber', optionalAuth, async (req, res) => {
  try {
    const { documentNumber } = req.params;
    const updates = req.body;

    // Map frontend fields to database fields
    const dbUpdates = {};
    if (updates.document_number !== undefined) dbUpdates.documentNumber = updates.document_number;
    if (updates.internal_status !== undefined) dbUpdates.internalStatus = updates.internal_status;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.phoneNumbers !== undefined) {
      // Ensure phoneNumbers is an array with max 6 elements
      const phoneNumbers = Array.isArray(updates.phoneNumbers) 
        ? updates.phoneNumbers.slice(0, 6).filter(p => p && p.trim()) 
        : [];
      dbUpdates.phoneNumbers = phoneNumbers;
    }
    if (updates.ownerPhoneIndex !== undefined) {
      dbUpdates.ownerPhoneIndex = updates.ownerPhoneIndex !== null && updates.ownerPhoneIndex >= 0 && updates.ownerPhoneIndex < 6
        ? updates.ownerPhoneIndex
        : null;
    }
    if (updates.last_action_date !== undefined) {
      dbUpdates.lastActionDate = updates.last_action_date ? new Date(updates.last_action_date) : null;
    }
    if (updates.next_follow_up_date !== undefined) {
      dbUpdates.nextFollowUpDate = updates.next_follow_up_date ? new Date(updates.next_follow_up_date) : null;
    }
    if (updates.recorded_date !== undefined) {
      dbUpdates.recordedDate = updates.recorded_date ? new Date(updates.recorded_date) : null;
    }
    if (updates.sale_date !== undefined) {
      dbUpdates.saleDate = updates.sale_date ? new Date(updates.sale_date) : null;
    }

    // Geocoding fields - handle updates.updates nested object for geocoding
    if (updates.updates) {
      if (updates.updates.latitude !== undefined) dbUpdates.latitude = updates.updates.latitude;
      if (updates.updates.longitude !== undefined) dbUpdates.longitude = updates.updates.longitude;
    }
    // Also handle direct latitude/longitude fields
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;

    // Workflow fields
    if (updates.workflow_stage !== undefined) {
      const validStages = [
        'not_started', 'initial_visit', 'people_search', 'call_owner',
        'land_records', 'visit_heirs', 'call_heirs', 'negotiating', 'dead_end'
      ];
      if (validStages.includes(updates.workflow_stage)) {
        dbUpdates.workflowStage = updates.workflow_stage;
      }
    }
    if (updates.workflow_log !== undefined) {
      dbUpdates.workflowLog = updates.workflow_log;
    }

    // Action/Task fields
    if (updates.actionType !== undefined) {
      if (updates.actionType) {
        // Map frontend values to enum: 'call' -> 'CALL', 'text' -> 'TEXT', etc.
        const actionMap = {
          'call': 'CALL',
          'text': 'TEXT',
          'mail': 'MAIL',
          'driveby': 'DRIVEBY',
          'drive-by': 'DRIVEBY' // Handle hyphenated version
        };
        const normalizedAction = updates.actionType.toLowerCase().replace(/-/g, '');
        dbUpdates.actionType = actionMap[normalizedAction] || updates.actionType.toUpperCase();
      } else {
        dbUpdates.actionType = null;
      }
    }
    if (updates.priority !== undefined) {
      if (updates.priority) {
        // Map frontend values to enum: 'med' -> 'MEDIUM', 'high' -> 'HIGH', 'low' -> 'LOW'
        const priorityMap = {
          'med': 'MEDIUM',
          'medium': 'MEDIUM',
          'high': 'HIGH',
          'low': 'LOW'
        };
        dbUpdates.priority = priorityMap[updates.priority.toLowerCase()] || updates.priority.toUpperCase();
      } else {
        dbUpdates.priority = null;
      }
    }
    if (updates.dueTime !== undefined) {
      if (updates.dueTime) {
        try {
          dbUpdates.dueTime = new Date(updates.dueTime);
          if (isNaN(dbUpdates.dueTime.getTime())) {
            throw new Error('Invalid date format');
          }
        } catch (dateError) {
          console.error('[PRE-FORECLOSURE] Invalid dueTime format:', updates.dueTime);
          return res.status(400).json({ error: 'Invalid dueTime format. Expected ISO date string.' });
        }
      } else {
        dbUpdates.dueTime = null;
      }
    }
    if (updates.assignedTo !== undefined) {
      dbUpdates.assignedTo = updates.assignedTo || null;
    }
    
    console.log('[PRE-FORECLOSURE] Update request:', {
      documentNumber,
      dbUpdates,
      originalUpdates: updates
    });

    const record = await prisma.preForeclosure.update({
      where: { documentNumber },
      data: dbUpdates
    });

    // Map back to frontend format
    res.json({
      document_number: record.documentNumber,
      type: record.type,
      address: record.address,
      city: record.city,
      zip: record.zip,
      filing_month: record.filingMonth,
      county: record.county,
      latitude: record.latitude,
      longitude: record.longitude,
      school_district: record.schoolDistrict,
      recorded_date: record.recordedDate ? record.recordedDate.toISOString() : null,
      sale_date: record.saleDate ? record.saleDate.toISOString() : null,
      internal_status: record.internalStatus,
      notes: record.notes,
      phoneNumbers: record.phoneNumbers || [],
      ownerPhoneIndex: record.ownerPhoneIndex,
      last_action_date: record.lastActionDate ? record.lastActionDate.toISOString() : null,
      next_follow_up_date: record.nextFollowUpDate ? record.nextFollowUpDate.toISOString() : null,
      actionType: record.actionType ? record.actionType.toLowerCase() : undefined,
      priority: record.priority ? record.priority.toLowerCase() === 'medium' ? 'med' : record.priority.toLowerCase() : undefined,
      dueTime: record.dueTime ? record.dueTime.toISOString() : undefined,
      assignedTo: record.assignedTo,
      inactive: record.inactive,
      workflow_stage: record.workflowStage || 'not_started',
      workflow_log: record.workflowLog || [],
      first_seen_month: record.firstSeenMonth,
      last_seen_month: record.lastSeenMonth,
      ownerName: record.ownerName,
      ownerAddress: record.ownerAddress,
      emails: record.emails || [],
      ownerLookupAt: record.ownerLookupAt ? record.ownerLookupAt.toISOString() : null,
      ownerLookupStatus: record.ownerLookupStatus,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pre-foreclosure record not found' });
    }
    console.error('[PRE-FORECLOSURE] Update error:', error);
    console.error('[PRE-FORECLOSURE] Update error details:', {
      code: error.code,
      message: error.message,
      meta: error.meta,
      stack: error.stack
    });
    const errorMessage = error.message || 'Failed to update pre-foreclosure record';
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// MARK RECORD AS VISITED
// ============================================================================

router.put('/:documentNumber/visit', optionalAuth, async (req, res) => {
  try {
    const { documentNumber } = req.params;
    const { driver, visited } = req.body; // visited: true/false (optional, defaults to true)

    const record = await prisma.preForeclosure.findUnique({
      where: { documentNumber }
    });

    if (!record) {
      return res.status(404).json({ error: 'Pre-foreclosure record not found' });
    }

    // Update visited status (can be set to true or false)
    const visitedStatus = visited !== undefined ? visited : true;
    const updateData = {
      visited: visitedStatus,
      visitedAt: visitedStatus ? new Date() : null,
      visitedBy: visitedStatus ? (driver || record.assignedTo || null) : null
    };

    const updated = await prisma.preForeclosure.update({
      where: { documentNumber },
      data: updateData,
      select: {
        id: true,
        documentNumber: true,
        address: true,
        visited: true,
        visitedAt: true,
        visitedBy: true
      }
    });

    // Map to frontend format
    res.json({
      document_number: updated.documentNumber,
      address: updated.address,
      visited: updated.visited,
      visited_at: updated.visitedAt?.toISOString(),
      visited_by: updated.visitedBy
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Visit update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pre-foreclosure record not found' });
    }
    res.status(500).json({ error: 'Failed to mark record as visited' });
  }
});

// ============================================================================
// GET UPLOAD HISTORY
// ============================================================================

router.get('/upload-history', optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Check if table exists before querying
    const history = await prisma.preForeclosureUploadHistory.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: parseInt(limit, 10)
    }).catch(err => {
      console.error('[PRE-FORECLOSURE] Upload history table may not exist:', err.message);
      return [];
    });

    res.json(history);
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Upload history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch upload history', details: error.message });
  }
});

// ============================================================================
// GET LATEST UPLOAD STATS (for dashboard)
// ============================================================================

router.get('/upload-stats/latest', optionalAuth, async (req, res) => {
  try {
    const latestUpload = await prisma.preForeclosureUploadHistory.findFirst({
      where: { success: true },
      orderBy: { uploadedAt: 'desc' }
    }).catch(err => {
      console.error('[PRE-FORECLOSURE] Upload history table may not exist:', err.message);
      return null;
    });

    if (!latestUpload) {
      return res.json({
        hasData: false,
        message: 'No uploads yet'
      });
    }

    res.json({
      hasData: true,
      filename: latestUpload.filename,
      uploadedAt: latestUpload.uploadedAt.toISOString(),
      uploadedBy: latestUpload.uploadedBy,
      newRecords: latestUpload.newRecords,
      updatedRecords: latestUpload.updatedRecords,
      inactiveRecords: latestUpload.inactiveRecords,
      totalRecords: latestUpload.totalRecords,
      activeRecords: latestUpload.activeRecords,
      newDocumentNumbers: latestUpload.newDocumentNumbers || []
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Latest upload stats error:', error);
    res.status(500).json({ error: 'Failed to fetch latest upload stats', details: error.message });
  }
});

// ============================================================================
// DELETE UPLOAD HISTORY ENTRY
// ============================================================================

router.delete('/upload-history/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const upload = await prisma.preForeclosureUploadHistory.findUnique({
      where: { id }
    });

    if (!upload) {
      return res.status(404).json({ error: 'Upload history not found' });
    }

    // Delete the pre-foreclosure records that were created in this upload
    let deletedRecordsCount = 0;

    console.log(`[PRE-FORECLOSURE] Upload history found:`, {
      filename: upload.filename,
      hasNewDocNumbers: !!upload.newDocumentNumbers,
      newDocNumbersCount: upload.newDocumentNumbers && Array.isArray(upload.newDocumentNumbers) ? upload.newDocumentNumbers.length : 0,
      newRecords: upload.newRecords
    });

    if (upload.newDocumentNumbers && Array.isArray(upload.newDocumentNumbers) && upload.newDocumentNumbers.length > 0) {
      console.log(`[PRE-FORECLOSURE] Deleting ${upload.newDocumentNumbers.length} records:`, upload.newDocumentNumbers.slice(0, 5));

      const deleteResult = await prisma.preForeclosure.deleteMany({
        where: {
          documentNumber: {
            in: upload.newDocumentNumbers
          }
        }
      });
      deletedRecordsCount = deleteResult.count;
      console.log(`[PRE-FORECLOSURE] Deleted ${deletedRecordsCount} records from upload: ${upload.filename}`);
    } else {
      console.log(`[PRE-FORECLOSURE] WARNING: No newDocumentNumbers found for upload ${upload.filename}. Cannot delete associated records.`);
    }

    // Delete the upload history entry
    await prisma.preForeclosureUploadHistory.delete({
      where: { id }
    });

    console.log(`[PRE-FORECLOSURE] Deleted upload history: ${upload.filename} (id: ${id})`);

    res.json({
      success: true,
      message: 'Upload history and associated records deleted successfully',
      deletedRecords: deletedRecordsCount
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Delete upload history error:', error);
    res.status(500).json({
      error: 'Failed to delete upload history',
      details: error.message
    });
  }
});

// ============================================================================
// BULK UPDATE DATES FOR ALL RECORDS
// ============================================================================

router.patch('/bulk-update-dates', optionalAuth, async (req, res) => {
  try {
    const { recordedDate, saleDate, excludeDocNumbers } = req.body;

    if (!recordedDate || !saleDate) {
      return res.status(400).json({ error: 'recordedDate and saleDate are required' });
    }

    // Build where clause to exclude specific document numbers
    const whereClause = excludeDocNumbers && Array.isArray(excludeDocNumbers) && excludeDocNumbers.length > 0
      ? { documentNumber: { notIn: excludeDocNumbers } }
      : {};

    const result = await prisma.preForeclosure.updateMany({
      where: whereClause,
      data: {
        recordedDate: new Date(recordedDate),
        saleDate: new Date(saleDate),
      }
    });

    console.log(`[PRE-FORECLOSURE] Bulk updated ${result.count} records with recordedDate=${recordedDate}, saleDate=${saleDate}`);

    res.json({
      success: true,
      message: 'Bulk update completed',
      updatedCount: result.count
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Bulk update error:', error);
    res.status(500).json({
      error: 'Failed to bulk update dates',
      details: error.message
    });
  }
});

// ============================================================================
// DELETE INDIVIDUAL PRE-FORECLOSURE RECORD
// ============================================================================

router.delete('/:documentNumber', optionalAuth, async (req, res) => {
  try {
    const { documentNumber } = req.params;

    const record = await prisma.preForeclosure.findUnique({
      where: { documentNumber }
    });

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    await prisma.preForeclosure.delete({
      where: { documentNumber }
    });

    console.log(`[PRE-FORECLOSURE] Deleted record: ${documentNumber} at ${record.address}`);

    res.json({
      success: true,
      message: 'Pre-foreclosure record deleted successfully'
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Delete record error:', error);
    res.status(500).json({
      error: 'Failed to delete pre-foreclosure record',
      details: error.message
    });
  }
});

// ============================================================================
// DELETE ALL PRE-FORECLOSURE RECORDS
// ============================================================================

router.delete('/', optionalAuth, async (req, res) => {
  try {
    await prisma.preForeclosure.deleteMany({});
    res.json({ success: true, message: 'All pre-foreclosure records deleted' });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete pre-foreclosure records' });
  }
});

// ============================================================================
// SCRAPE BEXAR COUNTY PUBLIC SEARCH
// ============================================================================

router.post('/scrape', optionalAuth, async (req, res) => {
  try {
    const { startDate, endDate, importRecords = false } = req.body;

    console.log('[SCRAPE] Starting Bexar County foreclosure scrape...');

    // Scrape the website
    const result = await scrapeBexarForeclosures({ startDate, endDate });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    // If importRecords is true, save new records to the database
    if (importRecords && result.records.length > 0) {
      // Only import records that have an actual street address
      const recordsWithAddress = result.records.filter(r => r.address && r.address.trim().length > 0);
      const skippedNoAddress = result.records.length - recordsWithAddress.length;
      if (skippedNoAddress > 0) {
        console.log(`[SCRAPE] Skipped ${skippedNoAddress} records with no address (not yet indexed by county)`);
      }

      const existingDocs = await prisma.preForeclosure.findMany({
        select: { documentNumber: true, address: true, saleDate: true },
      });
      const existingMap = new Map(existingDocs.map(r => [r.documentNumber, r]));

      // Split into new records and existing records that need updating
      const newRecords = [];
      const updateRecords = [];
      for (const r of recordsWithAddress) {
        const existing = existingMap.get(r.documentNumber);
        if (!existing) {
          newRecords.push(r);
        } else if (!existing.address || existing.address.trim() === '') {
          // Existing record has no address - update it
          updateRecords.push(r);
        } else if (!existing.saleDate && r.saleDate) {
          // Existing record missing sale date - update it
          updateRecords.push(r);
        }
      }

      let importedCount = 0;
      let updatedCount = 0;

      // Insert new records
      if (newRecords.length > 0) {
        const created = await prisma.preForeclosure.createMany({
          data: newRecords.map(r => {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            return {
              documentNumber: r.documentNumber,
              address: r.address,
              city: r.city || 'SAN ANTONIO',
              zip: r.zip || '',
              recordedDate: r.recordedDate ? new Date(r.recordedDate) : null,
              saleDate: r.saleDate ? new Date(r.saleDate) : null,
              type: 'Mortgage',
              filingMonth: monthStr,
              firstSeenMonth: monthStr,
              lastSeenMonth: monthStr,
              workflowStage: 'not_started',
            };
          }),
          skipDuplicates: true,
        });
        importedCount = created.count;
        console.log(`[SCRAPE] Imported ${created.count} new records`);
      }

      // Update existing records that now have address/sale date data
      if (updateRecords.length > 0) {
        for (const r of updateRecords) {
          await prisma.preForeclosure.update({
            where: { documentNumber: r.documentNumber },
            data: {
              address: r.address,
              city: r.city || 'SAN ANTONIO',
              zip: r.zip || '',
              saleDate: r.saleDate ? new Date(r.saleDate) : undefined,
              recordedDate: r.recordedDate ? new Date(r.recordedDate) : undefined,
            },
          });
        }
        updatedCount = updateRecords.length;
        console.log(`[SCRAPE] Updated ${updatedCount} existing records with new address/date data`);
      }

      return res.json({
        success: true,
        scraped: result.records.length,
        imported: importedCount,
        updated: updatedCount,
        skippedDuplicates: recordsWithAddress.length - newRecords.length - updateRecords.length,
        skippedNoAddress,
        records: result.records,
      });
    }

    // Just return scraped data without importing
    res.json({
      success: true,
      scraped: result.records.length,
      imported: 0,
      records: result.records,
    });

  } catch (error) {
    console.error('[SCRAPE] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;

