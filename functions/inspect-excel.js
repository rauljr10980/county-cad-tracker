/**
 * Excel File Inspector
 * Inspects an Excel file to verify it contains the expected data
 * 
 * Usage: node inspect-excel.js <path-to-excel-file>
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Get Excel file path from command line argument
const excelFilePath = process.argv[2];

if (!excelFilePath) {
  console.error('❌ Error: Excel file path is required');
  console.log('Usage: node inspect-excel.js <path-to-excel-file>');
  console.log('Example: node inspect-excel.js "C:\\Users\\Raulm\\OneDrive\\FINISHED SCRAPED DATA .xlsx"');
  process.exit(1);
}

if (!fs.existsSync(excelFilePath)) {
  console.error(`❌ Error: File not found: ${excelFilePath}`);
  process.exit(1);
}

function inspectExcel() {
  try {
    console.log('='.repeat(80));
    console.log('EXCEL FILE INSPECTOR');
    console.log('='.repeat(80));
    console.log(`File: ${excelFilePath}`);
    console.log(`File size: ${(fs.statSync(excelFilePath).size / 1024 / 1024).toFixed(2)} MB`);
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

    console.log(`✅ Found ${workbook.SheetNames.length} sheet(s):`, workbook.SheetNames.join(', '));
    console.log('');

    // Process first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found or is empty`);
    }

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    console.log(`Sheet "${sheetName}" dimensions: ${range.e.r + 1} rows × ${range.e.c + 1} columns`);
    console.log('');

    // Check for headers in row 3 (0-indexed row 2)
    console.log('🔍 Checking for headers...');
    let headerRow = [];
    let dataStartRow = 3; // Default: data starts at row 4
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col });
      const cell = worksheet[cellAddress];
      if (cell && cell.v) {
        headerRow.push(cell.v.toString().trim());
      } else {
        headerRow.push(`__EMPTY_${col}`);
      }
    }

    // If row 3 is empty, try row 1 (0-indexed row 0)
    if (headerRow.every(h => h.startsWith('__EMPTY') || !h)) {
      console.log(`⚠️  Row 3 appears empty, checking row 1...`);
      headerRow = [];
      dataStartRow = 1; // Data starts at row 2
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

    // Filter out empty headers
    const validHeaders = headerRow.filter(h => !h.startsWith('__EMPTY') && h);
    console.log(`✅ Found ${validHeaders.length} valid column headers`);
    console.log('');

    // Show all headers
    console.log('📋 Column Headers:');
    console.log('-'.repeat(80));
    validHeaders.forEach((header, idx) => {
      console.log(`  ${(idx + 1).toString().padStart(3)}. ${header}`);
    });
    console.log('');

    // Check for NEW- columns
    const newColumns = validHeaders.filter(h => h && h.toUpperCase().startsWith('NEW-'));
    console.log(`🔍 NEW- columns found: ${newColumns.length}`);
    if (newColumns.length > 0) {
      console.log('   NEW- columns:');
      newColumns.forEach(col => console.log(`     - ${col}`));
    }
    console.log('');

    // Check for key columns
    const keyColumns = {
      'CAN / Account Number': validHeaders.some(h => /can|account/i.test(h)),
      'Owner Name': validHeaders.some(h => /owner|name/i.test(h)),
      'Property Address': validHeaders.some(h => /addrstring|address|property/i.test(h)),
      'Legal Status': validHeaders.some(h => /legalstatus|status/i.test(h)),
      'Total Amount Due': validHeaders.some(h => /total|amount|due|balance/i.test(h)),
    };

    console.log('🔑 Key Columns Status:');
    console.log('-'.repeat(80));
    Object.entries(keyColumns).forEach(([key, found]) => {
      console.log(`  ${found ? '✅' : '❌'} ${key}`);
    });
    console.log('');

    // Convert to JSON to get actual data
    console.log('📊 Analyzing data rows...');
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: headerRow,
      range: dataStartRow,
      defval: '',
      blankrows: false,
    });

    console.log(`✅ Found ${data.length} data rows`);
    console.log('');

    if (data.length === 0) {
      console.log('⚠️  WARNING: No data rows found in the Excel file!');
      return;
    }

    // Show sample rows
    console.log('📝 Sample Data (First 3 rows):');
    console.log('='.repeat(80));
    
    const sampleRows = data.slice(0, 3);
    sampleRows.forEach((row, idx) => {
      console.log(`\nRow ${idx + 1}:`);
      console.log('-'.repeat(80));
      
      // Show key fields
      const accountNumber = row['CAN'] || row['Account Number'] || row['Account'] || Object.values(row).find(v => v && String(v).trim());
      const ownerName = row['Owner Name'] || row['Owner'] || row['Name'] || '';
      const propertyAddress = row['ADDRSTRING'] || row['Property Address'] || row['Address'] || '';
      const status = row['LEGALSTATUS'] || row['Legal Status'] || row['Status'] || '';
      const totalDue = row['Total'] || row['Total Amount Due'] || row['Amount Due'] || '';
      
      console.log(`  Account Number: ${accountNumber || '(not found)'}`);
      console.log(`  Owner Name: ${ownerName || '(not found)'}`);
      console.log(`  Property Address: ${propertyAddress || '(not found)'}`);
      console.log(`  Status: ${status || '(not found)'}`);
      console.log(`  Total Due: ${totalDue || '(not found)'}`);
      
      // Show NEW- columns with data
      const newColumnsWithData = newColumns.filter(col => row[col] && String(row[col]).trim());
      if (newColumnsWithData.length > 0) {
        console.log(`  NEW- columns with data (${newColumnsWithData.length}):`);
        newColumnsWithData.slice(0, 5).forEach(col => {
          const value = String(row[col]).substring(0, 50);
          console.log(`    - ${col}: ${value}${value.length >= 50 ? '...' : ''}`);
        });
        if (newColumnsWithData.length > 5) {
          console.log(`    ... and ${newColumnsWithData.length - 5} more`);
        }
      }
    });

    console.log('');
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ File exists and is readable`);
    console.log(`✅ Sheet "${sheetName}" contains ${data.length} data rows`);
    console.log(`✅ Found ${validHeaders.length} columns`);
    console.log(`✅ Found ${newColumns.length} NEW- columns`);
    console.log(`✅ Key columns: ${Object.values(keyColumns).filter(Boolean).length}/${Object.keys(keyColumns).length} found`);
    console.log('');
    
    if (data.length === 0) {
      console.log('❌ WARNING: No data rows to import!');
    } else if (newColumns.length === 0) {
      console.log('⚠️  WARNING: No NEW- columns found. The import will still work, but scraped data fields may be missing.');
    } else {
      console.log('✅ File looks good! Ready to import.');
      console.log('');
      console.log('To import this file, run:');
      console.log(`  node import-excel-direct.js "${excelFilePath}"`);
    }
    console.log('='.repeat(80));

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the inspection
inspectExcel();

