/**
 * Test script to preview what would be uploaded to PostgreSQL
 * 
 * This script reads the Excel file and shows what data would be uploaded
 * WITHOUT connecting to the database. Use this to verify column mappings.
 * 
 * Usage: node test_upload_dry_run.js <path-to-excel-file>
 * Example: node test_upload_dry_run.js "finishedscraperdata.xlsx"
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Get Excel file path from command line argument
const excelFilePath = process.argv[2];

if (!excelFilePath) {
  console.error('❌ Error: Excel file path is required');
  console.log('Usage: node test_upload_dry_run.js <path-to-excel-file>');
  console.log('Example: node test_upload_dry_run.js "finishedscraperdata.xlsx"');
  process.exit(1);
}

if (!fs.existsSync(excelFilePath)) {
  console.error(`❌ Error: File not found: ${excelFilePath}`);
  process.exit(1);
}

/**
 * Extract property data from Excel rows (same logic as upload script)
 */
function extractProperties(data) {
  if (!data || data.length === 0) {
    return [];
  }
  
  const headers = Object.keys(data[0] || {});
  
  // Explicit column mappings
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
        break;
      }
    }
  });
  
  // Also try partial matches
  headers.forEach(header => {
    if (!header) return;
    const normalized = header.trim().toUpperCase();
    
    if (!foundColumns.accountNumber && (normalized.includes('ACCOUNT') && normalized.includes('NUMBER'))) {
      foundColumns.accountNumber = header;
    }
    if (!foundColumns.ownerName && (normalized.includes('OWNER') && normalized.includes('NAME'))) {
      foundColumns.ownerName = header;
    }
    if (!foundColumns.propertyAddress && (normalized.includes('PROPERTY') && (normalized.includes('SITE') || normalized.includes('ADDRESS')))) {
      foundColumns.propertyAddress = header;
    }
    if (!foundColumns.mailingAddress && (normalized.includes('OWNER') && normalized.includes('ADDRESS'))) {
      foundColumns.mailingAddress = header;
    }
    if (!foundColumns.totalDue && (normalized.includes('TOTAL') && (normalized.includes('AMOUNT') || normalized.includes('DUE')))) {
      foundColumns.totalDue = header;
    }
  });
  
  const properties = data.map((row, index) => {
    const getValue = (key) => {
      const col = foundColumns[key];
      if (!col) return null;
      const value = row[col];
      if (value === undefined || value === null || value === '') return null;
      return value.toString().trim();
    };
    
    const accountNumber = getValue('accountNumber');
    if (!accountNumber) return null;
    
    const ownerName = getValue('ownerName') || 'Unknown';
    const propertyAddress = getValue('propertyAddress') || 'Unknown';
    const mailingAddress = getValue('mailingAddress') || null;
    
    const totalDueValue = getValue('totalDue');
    let totalDue = 0;
    if (totalDueValue) {
      const parsed = parseFloat(String(totalDueValue).replace(/[$,]/g, ''));
      if (!isNaN(parsed)) {
        totalDue = parsed;
      }
    }
    
    let status = 'ACTIVE';
    const legalStatus = row['LEGALSTATUS'] || row['Legal Status'] || row['legal_status'];
    if (legalStatus) {
      const firstChar = String(legalStatus).charAt(0).toUpperCase();
      if (firstChar === 'P') status = 'PENDING';
      else if (firstChar === 'J') status = 'JUDGMENT';
      else if (firstChar === 'A') status = 'ACTIVE';
    }
    
    let percentageDue = 0;
    const percentageValue = row['tot_percan'] || row['Percentage'] || row['percentage'];
    if (percentageValue) {
      const parsed = parseFloat(String(percentageValue));
      if (!isNaN(parsed)) {
        percentageDue = parsed;
      }
    }
    
    return {
      accountNumber,
      ownerName,
      propertyAddress,
      mailingAddress,
      totalDue,
      percentageDue,
      status
    };
  }).filter(p => p !== null && p.accountNumber);
  
  return { properties, foundColumns };
}

async function testDryRun() {
  try {
    console.log('='.repeat(80));
    console.log('DRY RUN - PREVIEW EXCEL DATA (NO DATABASE CONNECTION)');
    console.log('='.repeat(80));
    console.log(`File: ${excelFilePath}`);
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
    
    // Try to find headers
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
    
    // Show all column names
    console.log('📋 All columns in Excel file:');
    headerRow.forEach((col, index) => {
      if (col && !col.startsWith('__EMPTY')) {
        console.log(`  ${index + 1}. ${col}`);
      }
    });
    console.log('');
    
    // Extract properties
    console.log('🔍 Extracting properties...');
    const { properties, foundColumns } = extractProperties(data);
    console.log(`✅ Extracted ${properties.length} properties`);
    console.log('');
    
    // Show column mappings
    console.log('📊 Column Mappings:');
    Object.entries(foundColumns).forEach(([key, col]) => {
      console.log(`  ${key}: "${col}"`);
    });
    console.log('');
    
    // Check for missing columns
    const requiredColumns = ['accountNumber', 'ownerName', 'propertyAddress', 'totalDue'];
    const missingColumns = requiredColumns.filter(col => !foundColumns[col]);
    if (missingColumns.length > 0) {
      console.log('⚠️  WARNING: Missing required columns:');
      missingColumns.forEach(col => {
        console.log(`  - ${col}`);
      });
      console.log('');
    }
    
    if (properties.length === 0) {
      console.log('❌ No properties extracted. Check column mappings.');
      process.exit(1);
    }
    
    // Show sample properties
    console.log('📋 Sample Properties (first 5):');
    console.log('');
    properties.slice(0, 5).forEach((prop, index) => {
      console.log(`Property ${index + 1}:`);
      console.log(`  Account Number: ${prop.accountNumber}`);
      console.log(`  Owner Name: ${prop.ownerName}`);
      console.log(`  Property Address: ${prop.propertyAddress}`);
      console.log(`  Mailing Address: ${prop.mailingAddress || 'N/A'}`);
      console.log(`  Total Due: $${prop.totalDue.toFixed(2)}`);
      console.log(`  Percentage Due: ${prop.percentageDue.toFixed(2)}%`);
      console.log(`  Status: ${prop.status}`);
      console.log('');
    });
    
    // Statistics
    console.log('📊 Statistics:');
    console.log(`  Total rows in Excel: ${data.length}`);
    console.log(`  Properties extracted: ${properties.length}`);
    console.log(`  Success rate: ${((properties.length / data.length) * 100).toFixed(1)}%`);
    console.log('');
    
    const totalDueSum = properties.reduce((sum, p) => sum + p.totalDue, 0);
    const avgTotalDue = totalDueSum / properties.length;
    console.log(`  Total Amount Due (sum): $${totalDueSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  Average Amount Due: $${avgTotalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log('');
    
    const statusCounts = {};
    properties.forEach(p => {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    });
    console.log('  Status distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`    ${status}: ${count} (${((count / properties.length) * 100).toFixed(1)}%)`);
    });
    console.log('');
    
    console.log('='.repeat(80));
    console.log('DRY RUN COMPLETE');
    console.log('='.repeat(80));
    console.log('✅ This is what would be uploaded to the database');
    console.log('✅ If everything looks correct, run: node upload_excel_to_properties_table.js <file>');
    console.log('='.repeat(80));
    
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the dry run
testDryRun();


