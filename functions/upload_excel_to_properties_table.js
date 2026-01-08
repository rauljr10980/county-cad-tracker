/**
 * Upload Excel data to PostgreSQL properties table
 * 
 * This script uploads data from finishedscraperdata.xlsx to the PostgreSQL properties table.
 * 
 * Column Mapping:
 * - accountNumber ← NEW-Account Number (Excel column 60)
 * - ownerName ← NEW-Owner Name (Excel column 75)
 * - propertyAddress ← NEW-Property Site Address (Excel column 77)
 * - mailingAddress ← NEW-Owner Address (Excel column 74)
 * - totalDue ← NEW-Total Amount Due (Excel column 79)
 * 
 * Usage: node upload_excel_to_properties_table.js <path-to-excel-file>
 * Example: node upload_excel_to_properties_table.js "finishedscraperdata.xlsx"
 */

require('dotenv').config();
const XLSX = require('xlsx');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
const { createId } = require('@paralleldrive/cuid2');

// Get Excel file path from command line argument
const excelFilePath = process.argv[2];

if (!excelFilePath) {
  console.error('❌ Error: Excel file path is required');
  console.log('Usage: node upload_excel_to_properties_table.js <path-to-excel-file>');
  console.log('Example: node upload_excel_to_properties_table.js "finishedscraperdata.xlsx"');
  process.exit(1);
}

if (!fs.existsSync(excelFilePath)) {
  console.error(`❌ Error: File not found: ${excelFilePath}`);
  process.exit(1);
}

/**
 * Extract property data from Excel rows
 * Uses explicit column mappings as specified
 */
function extractProperties(data) {
  if (!data || data.length === 0) {
    console.log('[EXTRACT] No data to extract');
    return [];
  }
  
  const headers = Object.keys(data[0] || {});
  console.log(`[EXTRACT] Found ${headers.length} columns in Excel file`);
  console.log(`[EXTRACT] Sample headers:`, headers.slice(0, 10).join(', '), '...');
  
  // Find NEW- columns
  const newColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));
  console.log(`[EXTRACT] Found ${newColumns.length} NEW- columns`);
  
  // Explicit column mappings as specified
  const columnMappings = {
    accountNumber: ['NEW-Account Number', 'NEW-AccountNumber', 'NEW-ACCOUNT NUMBER'],
    ownerName: ['NEW-Owner Name', 'NEW-OwnerName', 'NEW-OWNER NAME'],
    propertyAddress: ['NEW-Property Site Address', 'NEW-PropertySiteAddress', 'NEW-PROPERTY SITE ADDRESS'],
    mailingAddress: ['NEW-Owner Address', 'NEW-OwnerAddress', 'NEW-OWNER ADDRESS'],
    totalDue: ['NEW-Total Amount Due', 'NEW-TotalAmountDue', 'NEW-TOTAL AMOUNT DUE']
  };
  
  // Find actual column names in Excel
  const foundColumns = {};
  Object.entries(columnMappings).forEach(([key, possibleNames]) => {
    for (const possibleName of possibleNames) {
      const found = headers.find(h => {
        const normalized = h.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const target = possibleName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return normalized === target || normalized.includes(target) || target.includes(normalized);
      });
      if (found) {
        foundColumns[key] = found;
        console.log(`[EXTRACT] Mapped "${found}" → ${key}`);
        break;
      }
    }
  });
  
  // Also try to find columns by partial match
  headers.forEach(header => {
    if (!header) return;
    const normalized = header.trim().toUpperCase();
    
    // Account Number
    if (!foundColumns.accountNumber && (normalized.includes('ACCOUNT') && normalized.includes('NUMBER'))) {
      foundColumns.accountNumber = header;
      console.log(`[EXTRACT] Mapped "${header}" → accountNumber (partial match)`);
    }
    
    // Owner Name
    if (!foundColumns.ownerName && (normalized.includes('OWNER') && normalized.includes('NAME'))) {
      foundColumns.ownerName = header;
      console.log(`[EXTRACT] Mapped "${header}" → ownerName (partial match)`);
    }
    
    // Property Site Address
    if (!foundColumns.propertyAddress && (normalized.includes('PROPERTY') && (normalized.includes('SITE') || normalized.includes('ADDRESS')))) {
      foundColumns.propertyAddress = header;
      console.log(`[EXTRACT] Mapped "${header}" → propertyAddress (partial match)`);
    }
    
    // Owner Address (for mailing)
    if (!foundColumns.mailingAddress && (normalized.includes('OWNER') && normalized.includes('ADDRESS'))) {
      foundColumns.mailingAddress = header;
      console.log(`[EXTRACT] Mapped "${header}" → mailingAddress (partial match)`);
    }
    
    // Total Amount Due
    if (!foundColumns.totalDue && (normalized.includes('TOTAL') && (normalized.includes('AMOUNT') || normalized.includes('DUE')))) {
      foundColumns.totalDue = header;
      console.log(`[EXTRACT] Mapped "${header}" → totalDue (partial match)`);
    }
  });
  
  // Verify required columns
  const requiredColumns = ['accountNumber', 'ownerName', 'propertyAddress', 'totalDue'];
  const missingColumns = requiredColumns.filter(col => !foundColumns[col]);
  
  if (missingColumns.length > 0) {
    console.warn(`[WARNING] Missing required columns: ${missingColumns.join(', ')}`);
    console.warn(`[WARNING] Will attempt to extract with available columns`);
  }
  
  // Helper function to parse numeric values
  const parseNumeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(String(value).replace(/[$,]/g, ''));
    return isNaN(num) ? null : num;
  };
  
  // Extract properties
  const properties = data.map((row, index) => {
    // Helper function to get NEW- column values (needs access to row and headers)
    const getNewColumnValue = (fieldName) => {
      // Try exact match first
      const exactMatch = row[`NEW-${fieldName}`];
      if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
        return exactMatch;
      }
      // Try case-insensitive match
      for (const header of headers) {
        if (header) {
          const headerUpper = header.toUpperCase().trim();
          const targetUpper = `NEW-${fieldName.toUpperCase()}`.trim();
          if (headerUpper === targetUpper) {
            const value = row[header];
            if (value !== undefined && value !== null && value !== '') {
              return value;
            }
          }
          // Try normalized match (remove special chars)
          const headerNormalized = headerUpper.replace(/[^A-Z0-9]/g, '');
          const targetNormalized = targetUpper.replace(/[^A-Z0-9]/g, '');
          if (headerNormalized === targetNormalized) {
            const value = row[header];
            if (value !== undefined && value !== null && value !== '') {
              return value;
            }
          }
        }
      }
      return null;
    };
    const getValue = (key) => {
      const col = foundColumns[key];
      if (!col) return null;
      const value = row[col];
      if (value === undefined || value === null || value === '') return null;
      return value.toString().trim();
    };
    
    const accountNumber = getValue('accountNumber');
    if (!accountNumber) {
      return null; // Skip rows without account number
    }
    
    const ownerName = getValue('ownerName') || getNewColumnValue('Owner Name') || 'Unknown';
    const propertyAddress = getValue('propertyAddress') || getNewColumnValue('Property Site Address') || 'Unknown';
    const mailingAddress = getValue('mailingAddress') || getNewColumnValue('Owner Address') || null;
    
    // Parse total due as number
    const totalDueValue = getValue('totalDue') || getNewColumnValue('Total Amount Due') || getNewColumnValue('Total');
    let totalDue = 0;
    if (totalDueValue) {
      const parsed = parseNumeric(totalDueValue);
      if (parsed !== null) {
        totalDue = parsed;
      }
    }
    
    // Try to get status from LEGALSTATUS column
    let status = 'ACTIVE';
    const legalStatus = row['LEGALSTATUS'] || row['Legal Status'] || row['legal_status'];
    if (legalStatus) {
      const firstChar = String(legalStatus).charAt(0).toUpperCase();
      if (firstChar === 'P') status = 'PENDING';
      else if (firstChar === 'J') status = 'JUDGMENT';
      else if (firstChar === 'A') status = 'ACTIVE';
    }
    
    // Try to get percentage
    let percentageDue = 0;
    const percentageValue = row['tot_percan'] || row['Percentage'] || row['percentage'];
    if (percentageValue) {
      const parsed = parseFloat(String(percentageValue));
      if (!isNaN(parsed)) {
        percentageDue = parsed;
      }
    }
    
    // Extract all additional fields from NEW- columns
    return {
      accountNumber,
      ownerName,
      propertyAddress,
      mailingAddress,
      totalDue,
      percentageDue,
      status,
      // Additional fields from NEW- columns
      legalDescription: getNewColumnValue('Legal Description') || null,
      marketValue: parseNumeric(getNewColumnValue('Total Market Value')),
      landValue: parseNumeric(getNewColumnValue('Land Value')),
      improvementValue: parseNumeric(getNewColumnValue('Improvement Value')),
      cappedValue: parseNumeric(getNewColumnValue('Capped Value')),
      agriculturalValue: parseNumeric(getNewColumnValue('Agricultural Value')),
      exemptions: (() => {
        const val = getNewColumnValue('Exemptions');
        return val ? String(val).split(',').map(e => e.trim()).filter(e => e) : [];
      })(),
      jurisdictions: (() => {
        const val = getNewColumnValue('Jurisdictions');
        return val ? String(val).split(',').map(j => j.trim()).filter(j => j) : [];
      })(),
      lastPaymentDate: getNewColumnValue('Last Payment Date') || null,
      lastPaymentAmount: parseNumeric(getNewColumnValue('Last Payment Amount Received')),
      lastPayer: getNewColumnValue('Last Payer') || null,
      delinquentAfter: getNewColumnValue('Delinquent After') || null,
      halfPaymentOptionAmount: parseNumeric(getNewColumnValue('Half Payment Option Amount')),
      priorYearsAmountDue: parseNumeric(getNewColumnValue('Prior Years Amount Due')),
      taxYear: (() => {
        const val = getNewColumnValue('Tax Year');
        if (val) {
          const year = parseInt(String(val));
          return isNaN(year) ? null : year;
        }
        return null;
      })(),
      yearAmountDue: parseNumeric(getNewColumnValue('Year Amount Due')),
      yearTaxLevy: parseNumeric(getNewColumnValue('Year Tax Levy')),
      link: getNewColumnValue('Link') || null,
      ownerAddress: getNewColumnValue('Owner Address') || null
    };
  }).filter(p => p !== null && p.accountNumber);
  
  console.log(`[EXTRACT] Extracted ${properties.length} properties from ${data.length} rows`);
  
  return properties;
}

async function uploadToDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('='.repeat(80));
    console.log('UPLOAD EXCEL DATA TO POSTGRESQL PROPERTIES TABLE');
    console.log('='.repeat(80));
    console.log(`File: ${excelFilePath}`);
    console.log('');
    
    // Check DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL is not set in .env file');
      console.error('Please add DATABASE_URL to your .env file');
      console.error('Get it from: Railway → PostgreSQL service → Variables → DATABASE_URL');
      process.exit(1);
    }
    
    console.log('✅ DATABASE_URL is set');
    console.log('');
    
    // Connect to database
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Database connected');
    console.log('');
    
    // Read Excel file
    console.log('📖 Reading Excel file...');
    const workbook = XLSX.readFile(excelFilePath, {
      cellDates: false,
      cellStyles: false,
      sheetStubs: false,
    });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file has no sheets');
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found or is empty`);
    }
    
    // Try to find headers - check row 3 first, then row 1
    let headerRow = [];
    let dataStartRow = 3;
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col });
      const cell = worksheet[cellAddress];
      if (cell && cell.v) {
        headerRow.push(cell.v.toString().trim());
      } else {
        headerRow.push(`__EMPTY_${col}`);
      }
    }
    
    if (headerRow.every(h => h.startsWith('__EMPTY') || !h)) {
      console.log(`[PROCESS] Row 3 empty, trying row 1 for headers`);
      headerRow = [];
      dataStartRow = 1;
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          headerRow.push(cell.v.toString().trim());
        } else {
          headerRow.push(`__EMPTY_${col}`);
        }
      }
    }
    
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: headerRow,
      range: dataStartRow,
      defval: '',
      blankrows: false,
    });
    
    console.log(`✅ Found ${data.length} rows in Excel file`);
    console.log(`✅ Found ${headerRow.length} columns`);
    console.log('');
    
    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    // Extract properties
    console.log('🔍 Extracting properties...');
    const properties = extractProperties(data);
    console.log(`✅ Extracted ${properties.length} properties`);
    console.log('');
    
    if (properties.length === 0) {
      throw new Error('No properties extracted from Excel file');
    }
    
    // Show sample property
    console.log('📋 Sample property:');
    const sample = properties[0];
    console.log(`  Account Number: ${sample.accountNumber}`);
    console.log(`  Owner Name: ${sample.ownerName}`);
    console.log(`  Property Address: ${sample.propertyAddress}`);
    console.log(`  Mailing Address: ${sample.mailingAddress || 'N/A'}`);
    console.log(`  Total Due: $${sample.totalDue.toFixed(2)}`);
    console.log(`  Status: ${sample.status}`);
    console.log('');
    
    // Process properties in batches
    console.log('💾 Inserting properties into database...');
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < properties.length; i += BATCH_SIZE) {
      const batch = properties.slice(i, i + BATCH_SIZE);
      
      for (const prop of batch) {
        try {
          if (!prop.accountNumber) {
            skipped++;
            continue;
          }
          
          const validStatus = ['JUDGMENT', 'ACTIVE', 'PENDING', 'PAID', 'REMOVED'].includes(prop.status) 
            ? prop.status 
            : 'ACTIVE';
          
          // Check if property exists to get its ID
          const checkResult = await client.query(
            'SELECT id, "accountNumber" FROM properties WHERE "accountNumber" = $1',
            [prop.accountNumber]
          );
          
          // Use existing ID if property exists, otherwise generate a new cuid
          const propertyId = checkResult.rows.length > 0 ? checkResult.rows[0].id : createId();
          
          // Build SQL query for upsert with all fields
          // Prisma schema maps to "properties" (lowercase) via @@map("properties")
          const query = `
            INSERT INTO properties (
              id, "accountNumber", "ownerName", "propertyAddress", "mailingAddress",
              "totalDue", "percentageDue", "status", "taxYear", "legalDescription",
              "marketValue", "landValue", "improvementValue", "cappedValue", "agriculturalValue",
              "exemptions", "jurisdictions", "lastPaymentDate", "lastPaymentAmount", "lastPayer",
              "delinquentAfter", "halfPaymentOptionAmount", "priorYearsAmountDue",
              "yearAmountDue", "yearTaxLevy", "link", "ownerAddress", 
              "phoneNumbers", "isNew", "isRemoved", "statusChanged", "percentageChanged",
              "createdAt", "updatedAt"
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, NOW(), NOW()
            )
            ON CONFLICT ("accountNumber") 
            DO UPDATE SET
              "ownerName" = EXCLUDED."ownerName",
              "propertyAddress" = EXCLUDED."propertyAddress",
              "mailingAddress" = EXCLUDED."mailingAddress",
              "totalDue" = EXCLUDED."totalDue",
              "percentageDue" = EXCLUDED."percentageDue",
              "status" = EXCLUDED."status",
              "taxYear" = EXCLUDED."taxYear",
              "legalDescription" = EXCLUDED."legalDescription",
              "marketValue" = EXCLUDED."marketValue",
              "landValue" = EXCLUDED."landValue",
              "improvementValue" = EXCLUDED."improvementValue",
              "cappedValue" = EXCLUDED."cappedValue",
              "agriculturalValue" = EXCLUDED."agriculturalValue",
              "exemptions" = EXCLUDED."exemptions",
              "jurisdictions" = EXCLUDED."jurisdictions",
              "lastPaymentDate" = EXCLUDED."lastPaymentDate",
              "lastPaymentAmount" = EXCLUDED."lastPaymentAmount",
              "lastPayer" = EXCLUDED."lastPayer",
              "delinquentAfter" = EXCLUDED."delinquentAfter",
              "halfPaymentOptionAmount" = EXCLUDED."halfPaymentOptionAmount",
              "priorYearsAmountDue" = EXCLUDED."priorYearsAmountDue",
              "yearAmountDue" = EXCLUDED."yearAmountDue",
              "yearTaxLevy" = EXCLUDED."yearTaxLevy",
              "link" = EXCLUDED."link",
              "ownerAddress" = EXCLUDED."ownerAddress",
              "updatedAt" = NOW()
          `;
          
          // Validate and sanitize data
          // The pg library automatically converts JavaScript arrays to PostgreSQL arrays
          const exemptions = Array.isArray(prop.exemptions) ? prop.exemptions : [];
          const jurisdictions = Array.isArray(prop.jurisdictions) ? prop.jurisdictions : [];
          
          // Truncate strings that might be too long (PostgreSQL text has no limit, but be safe)
          const truncate = (str, maxLength = 10000) => {
            if (!str) return null;
            const s = String(str);
            return s.length > maxLength ? s.substring(0, maxLength) : s;
          };

          // Validate numeric values
          const validateNumber = (val, defaultValue = null) => {
            if (val === null || val === undefined || val === '') return defaultValue;
            const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''));
            return isNaN(num) ? defaultValue : num;
          };

          const values = [
            propertyId,
            truncate(prop.accountNumber, 255) || 'Unknown',
            truncate(prop.ownerName, 500) || 'Unknown',
            truncate(prop.propertyAddress, 1000) || 'Unknown',
            truncate(prop.mailingAddress, 1000),
            validateNumber(prop.totalDue, 0),
            validateNumber(prop.percentageDue, 0),
            validStatus,
            prop.taxYear ? parseInt(prop.taxYear) : null,
            truncate(prop.legalDescription, 5000),
            validateNumber(prop.marketValue),
            validateNumber(prop.landValue),
            validateNumber(prop.improvementValue),
            validateNumber(prop.cappedValue),
            validateNumber(prop.agriculturalValue),
            exemptions, // pg library handles array conversion automatically
            jurisdictions, // pg library handles array conversion automatically
            truncate(prop.lastPaymentDate, 50),
            validateNumber(prop.lastPaymentAmount),
            truncate(prop.lastPayer, 500),
            truncate(prop.delinquentAfter, 50),
            validateNumber(prop.halfPaymentOptionAmount),
            validateNumber(prop.priorYearsAmountDue),
            validateNumber(prop.yearAmountDue),
            validateNumber(prop.yearTaxLevy),
            truncate(prop.link, 2000),
            truncate(prop.ownerAddress, 1000),
            [], // phoneNumbers - empty array (not in Excel)
            false, // isNew
            false, // isRemoved
            false, // statusChanged
            false // percentageChanged
          ];
          
          await client.query(query, values);
          
          if (checkResult.rows.length === 0) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`[ERROR] Error upserting property ${prop.accountNumber}:`, error.message);
          errors.push({
            accountNumber: prop.accountNumber || 'Unknown',
            error: error.message
          });
          skipped++;
        }
      }
      
      const progress = Math.min(i + BATCH_SIZE, properties.length);
      const percent = ((progress / properties.length) * 100).toFixed(1);
      console.log(`  Progress: ${progress}/${properties.length} (${percent}%) - Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);
    }
    
    console.log('');
    console.log('='.repeat(80));
    console.log('UPLOAD COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total properties processed: ${properties.length}`);
    console.log(`✅ Inserted: ${inserted}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    if (errors.length > 0) {
      console.log(`❌ Errors: ${errors.length}`);
      if (errors.length <= 10) {
        console.log('Error details:');
        errors.forEach(e => console.log(`  - ${e.accountNumber}: ${e.error}`));
      }
    }
    console.log('='.repeat(80));
    
    await client.end();
    console.log('✅ Database disconnected');
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

// Run the upload
uploadToDatabase();

