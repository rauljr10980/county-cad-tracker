const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Path to the excel_batches folder
const batchesFolder = 'C:\\Users\\Raulm\\OneDrive\\Documents\\Raul Medina\\Abstract data from Tax collector, to then feed it to my software\\excel_batches';

// Output file path
const outputFile = 'finishedscraperdata.xlsx';

console.log('Starting to merge batch files...\n');

// Array to store all data
const allData = [];

// Read all batch files (batch_01 to batch_20)
for (let i = 1; i <= 20; i++) {
    const batchName = `batch_${i.toString().padStart(2, '0')}.xlsx`;
    const batchPath = path.join(batchesFolder, batchName);

    if (fs.existsSync(batchPath)) {
        console.log(`Reading ${batchName}...`);
        const workbook = XLSX.readFile(batchPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        allData.push(...data);
        console.log(`  - Rows: ${data.length}`);
    } else {
        console.log(`Warning: ${batchName} not found, skipping...`);
    }
}

if (allData.length > 0) {
    console.log(`\nMerging all data...`);
    console.log(`Total rows in merged data: ${allData.length}`);

    // Create new workbook
    const newWorkbook = XLSX.utils.book_new();
    const newWorksheet = XLSX.utils.json_to_sheet(allData);
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'MergedData');

    // Save to file
    console.log(`\nSaving to ${outputFile}...`);
    XLSX.writeFile(newWorkbook, outputFile);

    console.log(`\n✅ Successfully merged batch files!`);
    console.log(`📁 Output file: ${path.resolve(outputFile)}`);
    console.log(`📊 Total records: ${allData.length.toLocaleString()}`);
} else {
    console.log('❌ No batch files found to merge!');
}
