const fs = require('fs');
const XLSX = require('xlsx');

// Simple approach: Try to read PDF as text and create Excel
async function createExcelFromPDF(pdfPath, outputPath) {
  try {
    console.log('Attempting to extract data from PDF...');
    
    // Read PDF as binary and try to extract readable text
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // Convert buffer to string and look for readable text
    let text = '';
    try {
      // Try to extract text from PDF stream
      const bufferStr = dataBuffer.toString('utf8', 0, Math.min(10000, dataBuffer.length));
      
      // Look for text patterns
      const textMatches = bufferStr.match(/\([^)]+\)/g) || [];
      text = textMatches.map(m => m.replace(/[()]/g, '')).join('\n');
      
      if (text.length < 100) {
        // Try different encoding
        const latin1Str = dataBuffer.toString('latin1', 0, Math.min(50000, dataBuffer.length));
        const moreMatches = latin1Str.match(/[A-Z0-9\s,.-]{10,}/g) || [];
        text = moreMatches.slice(0, 100).join('\n');
      }
    } catch (e) {
      console.log('Direct text extraction limited');
    }
    
    if (text.length < 50) {
      console.log('\n⚠️  Could not extract enough text from PDF.');
      console.log('PDF files require special parsing libraries that have compatibility issues.');
      console.log('\n📋 RECOMMENDED: Use an online converter:');
      console.log('   1. Go to: https://www.adobe.com/acrobat/online/pdf-to-excel.html');
      console.log('   2. Upload your PDF');
      console.log('   3. Download the Excel file');
      console.log('   4. Upload to your app!\n');
      
      // Create a placeholder Excel with instructions
      const instructions = [
        ['Instructions to Convert PDF to Excel'],
        [''],
        ['1. Go to: https://www.adobe.com/acrobat/online/pdf-to-excel.html'],
        ['2. Upload: Pre-Foreclosure list pulled Dec 10 2025.pdf'],
        ['3. Click "Convert to Excel"'],
        ['4. Download the Excel file'],
        ['5. Upload it to your app!'],
        [''],
        ['Alternative: https://www.ilovepdf.com/pdf-to-excel']
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(instructions);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Instructions');
      XLSX.writeFile(wb, outputPath);
      
      console.log(`✅ Created instruction file: ${outputPath}`);
      return;
    }
    
    // Try to parse extracted text
    const lines = text.split('\n').filter(l => l.trim().length > 5);
    const rows = [];
    
    // Create basic structure
    lines.forEach((line, idx) => {
      const parts = line.split(/\s{2,}|\t|,/).filter(p => p.trim().length > 0);
      if (parts.length >= 2) {
        const row = {};
        parts.forEach((part, i) => {
          row[`Column${i + 1}`] = part.trim();
        });
        rows.push(row);
      }
    });
    
    if (rows.length > 0) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, outputPath);
      console.log(`\n✅ Created Excel file: ${outputPath}`);
      console.log(`   Rows: ${rows.length}`);
    } else {
      throw new Error('No data extracted');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.log('\n📋 Please use an online PDF to Excel converter.');
  }
}

const pdfPath = 'Pre-Foreclosure list pulled Dec 10 2025.pdf';
const outputPath = 'Pre-Foreclosure list pulled Dec 10 2025.xlsx';

if (fs.existsSync(pdfPath)) {
  createExcelFromPDF(pdfPath, outputPath);
} else {
  console.error(`PDF file not found: ${pdfPath}`);
}

