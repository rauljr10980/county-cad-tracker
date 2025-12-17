const fs = require('fs');
const XLSX = require('xlsx');

// Simple PDF text extraction using pdfjs-dist
async function convertPDFToExcel(pdfPath, outputPath) {
  try {
    console.log('Reading PDF file...');
    const pdfjsLib = require('pdfjs-dist');
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
    const pdf = await loadingTask.promise;
    
    console.log(`PDF has ${pdf.numPages} pages`);
    
    let allText = '';
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      allText += pageText + '\n';
    }
    
    console.log('Extracting text from PDF...');
    const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log(`Found ${lines.length} lines`);
    
    // Try to parse as table data
    const rows = [];
    let headers = null;
    let dataStartIndex = 0;
    
    // Look for header row
    const headerKeywords = ['account', 'owner', 'address', 'property', 'status', 'amount', 'due', 'balance', 'parcel'];
    
    for (let i = 0; i < Math.min(100, lines.length); i++) {
      const line = lines[i].toLowerCase();
      const matches = headerKeywords.filter(keyword => line.includes(keyword));
      if (matches.length >= 2) {
        // Found potential header
        headers = lines[i].split(/\s{2,}|\t/).filter(h => h.trim().length > 0);
        dataStartIndex = i + 1;
        console.log(`Found header at line ${i + 1} with ${headers.length} columns`);
        break;
      }
    }
    
    // Parse data rows
    if (headers) {
      for (let i = dataStartIndex; i < lines.length; i++) {
        const line = lines[i];
        if (line.length < 5) continue;
        
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
      // No header found, create generic structure
      console.log('No header found, creating generic structure...');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length < 10) continue;
        
        const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length >= 3) {
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
      console.log('Saving raw text for manual review...');
      
      // Save raw text
      const textFile = outputPath.replace('.xlsx', '_raw_text.txt');
      fs.writeFileSync(textFile, allText);
      console.log(`Raw text saved to: ${textFile}`);
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
    console.error('\nTrying alternative method...');
    
    // Fallback: Save as text file
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const textFile = outputPath.replace('.xlsx', '_raw_text.txt');
      fs.writeFileSync(textFile, 'PDF conversion failed. Please use an online converter:\n');
      fs.appendFileSync(textFile, 'https://www.ilovepdf.com/pdf-to-excel\n');
      fs.appendFileSync(textFile, 'or\n');
      fs.appendFileSync(textFile, 'https://www.adobe.com/acrobat/online/pdf-to-excel.html\n');
      console.log(`\nFallback: Instructions saved to ${textFile}`);
    } catch (e) {
      console.error('Fallback also failed:', e.message);
    }
  }
}

// Get file paths
const pdfPath = process.argv[2] || 'Pre-Foreclosure list pulled Dec 10 2025.pdf';
const outputPath = process.argv[3] || 'Pre-Foreclosure list pulled Dec 10 2025.xlsx';

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: PDF file not found: ${pdfPath}`);
  process.exit(1);
}

convertPDFToExcel(pdfPath, outputPath);

