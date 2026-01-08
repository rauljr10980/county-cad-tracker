/**
 * Direct Excel Import Script (using pg library)
 * Imports Excel file directly into PostgreSQL without Prisma
 * 
 * Usage: node import-excel-pg.js <path-to-excel-file>
 */

require('dotenv').config();
const XLSX = require('xlsx');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Get Excel file path from command line argument
const excelFilePath = process.argv[2];

if (!excelFilePath) {
  console.error('❌ Error: Excel file path is required');
  console.log('Usage: node import-excel-pg.js <path-to-excel-file>');
  process.exit(1);
}

if (!fs.existsSync(excelFilePath)) {
  console.error(`❌ Error: File not found: ${excelFilePath}`);
  process.exit(1);
}

// Copy extractProperties function from upload.js
function extractProperties(data) {
  if (!data || data.length === 0) {
    console.log('[EXTRACT] No data to extract');
    return [];
  }
  
  const headers = Object.keys(data[0] || {});
  console.log(`[EXTRACT] Extracting from ${data.length} rows with headers:`, headers.slice(0, 10).join(', '), '...');
  
  const mappings = {
    accountNumber: ['can', 'account', 'account number', 'account_number', 'acct', 'acct no'],
    ownerName: ['owner', 'owner name', 'owner_name', 'name'],
    propertyAddress: ['addrstring', 'property address', 'property_address', 'address', 'property'],
    mailingAddress: ['mailing address', 'mailing_address', 'mailing'],
    status: ['legalstatus', 'legal_status', 'legal status'],
    totalAmountDue: ['tot_percan', 'total', 'amount due', 'amount_due', 'due', 'balance', 'levy_balance'],
    totalPercentage: ['percentage', 'percent', 'pct'],
  };

  const columnMap = {};
  headers.forEach(header => {
    const trimmedHeader = header.trim();
    const lowerHeader = trimmedHeader.toLowerCase();
    const normalizedHeader = lowerHeader.replace(/[^a-z0-9]/g, '');
    
    Object.entries(mappings).forEach(([key, aliases]) => {
      if (columnMap[key]) return;
      
      for (const alias of aliases) {
        if (lowerHeader === alias || normalizedHeader === alias.replace(/[^a-z0-9]/g, '')) {
          columnMap[key] = trimmedHeader;
          return;
        }
      }
      
      for (const alias of aliases) {
        const normalizedAlias = alias.replace(/[^a-z0-9]/g, '');
        if (lowerHeader.includes(alias) || normalizedHeader.includes(normalizedAlias)) {
          columnMap[key] = trimmedHeader;
          return;
        }
      }
    });
  });
  
  const newColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));

  const properties = data.map((row, index) => {
    const getValue = (key) => {
      const col = columnMap[key];
      if (!col) {
        const rowKeys = Object.keys(row);
        const lowerKey = key.toLowerCase();
        for (const rowKey of rowKeys) {
          if (rowKey.toLowerCase() === lowerKey || 
              rowKey.toLowerCase().includes(lowerKey) ||
              lowerKey.includes(rowKey.toLowerCase())) {
            return (row[rowKey] || '').toString().trim();
          }
        }
        return '';
      }
      const value = row[col];
      if (value === undefined || value === null) return '';
      return value.toString().trim();
    };

    let finalAccountNumber = getValue('accountNumber');
    if (!finalAccountNumber) {
      for (const header of headers) {
        const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalizedHeader === 'CAN' || normalizedHeader.includes('CAN')) {
          finalAccountNumber = (row[header] || '').toString().trim();
          break;
        }
      }
    }
    
    if (!finalAccountNumber) {
      return null;
    }

    let finalPropertyAddress = getValue('propertyAddress');
    if (!finalPropertyAddress) {
      for (const header of headers) {
        const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalizedHeader === 'ADDRSTRING' || normalizedHeader.includes('ADDRSTRING') || 
            normalizedHeader.includes('ADDRESS')) {
          finalPropertyAddress = (row[header] || '').toString().trim();
          break;
        }
      }
    }

    let finalStatus = '';
    for (const header of headers) {
      if (header.trim().toUpperCase() === 'LEGALSTATUS') {
        finalStatus = (row[header] || '').toString().trim();
        break;
      }
    }
    
    let statusValue = 'ACTIVE';
    if (finalStatus) {
      const firstChar = finalStatus.charAt(0).toUpperCase();
      if (firstChar === 'P') statusValue = 'PENDING';
      else if (firstChar === 'J') statusValue = 'JUDGMENT';
      else if (firstChar === 'A') statusValue = 'ACTIVE';
    }

    const getNewColumn = (fieldName) => {
      const exactMatch = row[`NEW-${fieldName}`];
      if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
        return exactMatch;
      }
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

    const getNewColumnValue = (fieldName) => {
      let value = getNewColumn(fieldName);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
      value = row[`NEW-${fieldName}`];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
      for (const header of headers) {
        if (header && header.toUpperCase() === `NEW-${fieldName.toUpperCase()}`) {
          value = row[header];
          if (value !== undefined && value !== null && value !== '') {
            return value;
          }
        }
      }
      return null;
    };

    const parseNumeric = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseFloat(String(value).replace(/[$,]/g, ''));
      return isNaN(num) ? null : num;
    };

    const property = {
      accountNumber: finalAccountNumber,
      ownerName: getValue('ownerName') || getNewColumnValue('Owner Name') || 'Unknown',
      propertyAddress: finalPropertyAddress || getValue('propertyAddress') || getNewColumnValue('Property Site Address') || 'Unknown',
      mailingAddress: getValue('mailingAddress') || getNewColumnValue('Owner Address') || null,
      status: statusValue,
      totalDue: parseNumeric(getNewColumnValue('Total')) || parseNumeric(getNewColumnValue('Total Amount Due')) || parseFloat(getValue('totalAmountDue') || '0') || 0,
      percentageDue: parseFloat(getValue('totalPercentage') || '0') || 0,
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
      ownerAddress: getNewColumnValue('Owner Address') || null,
      phoneNumbers: [],
      isNew: false,
      isRemoved: false,
      statusChanged: false,
      percentageChanged: false
    };

    return property;
  }).filter(p => p !== null && p.accountNumber);

  console.log(`[EXTRACT] Extracted ${properties.length} properties (filtered from ${data.length} rows)`);
  
  return properties;
}

async function importExcel() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('='.repeat(80));
    console.log('DIRECT EXCEL IMPORT TO POSTGRESQL (using pg)');
    console.log('='.repeat(80));
    console.log(`File: ${excelFilePath}`);
    console.log('');

    // Check DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL is not set in .env file');
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
    console.log('');

    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }

    // Extract properties
    console.log('🔍 Extracting properties...');
    const properties = extractProperties(data);
    console.log(`✅ Extracted ${properties.length} properties`);
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

          // Build SQL query for upsert
          const query = `
            INSERT INTO "Property" (
              "accountNumber", "ownerName", "propertyAddress", "mailingAddress",
              "totalDue", "percentageDue", "status", "taxYear", "legalDescription",
              "phoneNumbers", "isNew", "isRemoved", "statusChanged", "percentageChanged",
              "marketValue", "landValue", "improvementValue", "cappedValue", "agriculturalValue",
              "exemptions", "jurisdictions", "lastPaymentDate", "lastPaymentAmount", "lastPayer",
              "delinquentAfter", "halfPaymentOptionAmount", "priorYearsAmountDue",
              "yearAmountDue", "yearTaxLevy", "link", "ownerAddress", "createdAt", "updatedAt"
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW()
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
              "phoneNumbers" = EXCLUDED."phoneNumbers",
              "isNew" = EXCLUDED."isNew",
              "isRemoved" = EXCLUDED."isRemoved",
              "statusChanged" = EXCLUDED."statusChanged",
              "percentageChanged" = EXCLUDED."percentageChanged",
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

          // Check if property exists
          const checkResult = await client.query(
            'SELECT "accountNumber" FROM "Property" WHERE "accountNumber" = $1',
            [prop.accountNumber]
          );

          const values = [
            prop.accountNumber,
            prop.ownerName || 'Unknown',
            prop.propertyAddress || 'Unknown',
            prop.mailingAddress,
            prop.totalDue || 0,
            prop.percentageDue || 0,
            validStatus,
            prop.taxYear,
            prop.legalDescription,
            JSON.stringify(prop.phoneNumbers || []),
            prop.isNew || false,
            prop.isRemoved || false,
            prop.statusChanged || false,
            prop.percentageChanged || false,
            prop.marketValue,
            prop.landValue,
            prop.improvementValue,
            prop.cappedValue,
            prop.agriculturalValue,
            JSON.stringify(prop.exemptions || []),
            JSON.stringify(prop.jurisdictions || []),
            prop.lastPaymentDate,
            prop.lastPaymentAmount,
            prop.lastPayer,
            prop.delinquentAfter,
            prop.halfPaymentOptionAmount,
            prop.priorYearsAmountDue,
            prop.yearAmountDue,
            prop.yearTaxLevy,
            prop.link,
            prop.ownerAddress
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
    console.log('IMPORT COMPLETE');
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

// Run the import
importExcel();

