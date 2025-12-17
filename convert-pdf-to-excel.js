const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

async function convertPDFToExcel(pdfPath, outputPath) {
  try {
    console.log('Reading PDF file...');
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    
    console.log('Extracting text from PDF...');
    const text = pdfData.text;
    
    // Split into lines
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log(`Found ${lines.length} lines in PDF`);
    
    // Try to find table structure
    // Look for header row
    let headerRow = null;
    let dataStartIndex = 0;
    
    // Common header patterns
    const headerPatterns = [
      /account/i,
      /owner/i,
      /address/i,
      /property/i,
      /status/i,
      /amount/i,
      /due/i,
      /balance/i
    ];
    
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i];
      const matches = headerPatterns.filter(pattern => pattern.test(line));
      if (matches.length >= 2) {
        headerRow = line;
        dataStartIndex = i + 1;
        console.log(`Found header at line ${i + 1}: ${line.substring(0, 100)}...`);
        break;
      }
    }
    
    // Parse data rows
    const rows = [];
    
    if (headerRow) {
      // Try to split header by common delimiters
      const headers = headerRow.split(/\s{2,}|\t/).filter(h => h.trim().length > 0);
      console.log(`Detected ${headers.length} columns:`, headers.slice(0, 5).join(', '), '...');
      
      // Parse data rows
      for (let i = dataStartIndex; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip lines that look like headers or page numbers
        if (line.match(/^(page|total|summary|account\s+owner)/i)) continue;
        if (line.length < 10) continue; // Skip very short lines
        
        // Try multiple splitting methods
        let parts = line.split(/\s{2,}/); // Split by 2+ spaces
        if (parts.length < 3) {
          parts = line.split(/\t/); // Try tabs
        }
        if (parts.length < 3) {
          parts = line.split(/,\s*/); // Try commas
        }
        
        parts = parts.map(p => p.trim()).filter(p => p.length > 0);
        
        if (parts.length >= 3) {
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = parts[idx] || '';
          });
          rows.push(row);
        }
      }
    } else {
      // No clear header found, try to extract data anyway
      console.log('No clear header found, attempting to extract data...');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length < 10) continue;
        
        // Try to split by multiple spaces or tabs
        const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p.length > 0);
        
        if (parts.length >= 3) {
          // Create generic column names
          const row = {};
          parts.forEach((part, idx) => {
            row[`Column${idx + 1}`] = part;
          });
          rows.push(row);
        }
      }
    }
    
    console.log(`Extracted ${rows.length} data rows`);
    
    if (rows.length === 0) {
      console.log('\n⚠️  No data rows found. The PDF might have a complex layout.');
      console.log('Try opening the PDF and exporting to Excel manually, or share the PDF structure.');
      return;
    }
    
    // Create Excel workbook
    console.log('Creating Excel file...');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties');
    
    // Write to file
    XLSX.writeFile(workbook, outputPath);
    
    console.log(`\n✅ Success! Excel file created: ${outputPath}`);
    console.log(`   Rows: ${rows.length}`);
    console.log(`   Columns: ${Object.keys(rows[0] || {}).length}`);
    
  } catch (error) {
    console.error('Error converting PDF:', error.message);
    console.error('\nMake sure you have installed dependencies:');
    console.error('  npm install pdf-parse xlsx');
  }
}

// Get file paths from command line or use defaults
const pdfPath = process.argv[2] || 'Pre-Foreclosure list pulled Dec 10 2025.pdf';
const outputPath = process.argv[3] || 'Pre-Foreclosure list pulled Dec 10 2025.xlsx';

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: PDF file not found: ${pdfPath}`);
  console.error('\nUsage: node convert-pdf-to-excel.js [pdf-file] [output-excel-file]');
  process.exit(1);
}

convertPDFToExcel(pdfPath, outputPath);

