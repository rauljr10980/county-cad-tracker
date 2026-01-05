/**
 * Data Migration Script
 * Migrate property data from Google Cloud Storage or local files to PostgreSQL
 *
 * Usage:
 *   node migrate-data.js --source gcs --bucket BUCKET_NAME
 *   node migrate-data.js --source local --file path/to/file.xlsx
 */

require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const prisma = require('./src/lib/prisma');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : null;
};

const source = getArg('--source') || 'local';
const bucketName = getArg('--bucket') || process.env.GCS_BUCKET;
const filePath = getArg('--file');

console.log('🚀 County CAD Tracker - Data Migration Tool\n');
console.log(`Source: ${source}`);
console.log(`Database: ${process.env.DATABASE_URL ? 'Connected' : 'NOT SET'}\n`);

/**
 * Download file from Google Cloud Storage
 */
async function downloadFromGCS(fileName) {
  try {
    console.log(`📥 Downloading ${fileName} from GCS bucket: ${bucketName}...`);

    const storage = new Storage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const tempFile = path.join(__dirname, 'temp-download.xlsx');
    await file.download({ destination: tempFile });

    console.log('✅ Downloaded successfully');
    return tempFile;
  } catch (error) {
    console.error('❌ Failed to download from GCS:', error.message);
    throw error;
  }
}

/**
 * List all Excel files in GCS bucket
 */
async function listGCSFiles() {
  try {
    console.log(`📂 Listing files in GCS bucket: ${bucketName}...`);

    const storage = new Storage();
    const [files] = await storage.bucket(bucketName).getFiles();

    const excelFiles = files
      .filter(file => file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))
      .map(file => ({
        name: file.name,
        size: file.metadata.size,
        updated: file.metadata.updated
      }));

    console.log(`Found ${excelFiles.length} Excel files:\n`);
    excelFiles.forEach(file => {
      console.log(`  - ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    });

    return excelFiles;
  } catch (error) {
    console.error('❌ Failed to list GCS files:', error.message);
    throw error;
  }
}

/**
 * Parse Excel file and extract property data
 */
function parseExcelFile(filePath) {
  try {
    console.log(`📊 Parsing Excel file: ${filePath}...`);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`✅ Found ${data.length} rows in Excel file`);
    return data;
  } catch (error) {
    console.error('❌ Failed to parse Excel file:', error.message);
    throw error;
  }
}

/**
 * Map Excel row to property object
 */
function mapRowToProperty(row) {
  // Try multiple column name variations
  const get = (field, ...alternatives) => {
    for (const alt of [field, ...alternatives]) {
      if (row[alt] !== undefined && row[alt] !== null && row[alt] !== '') {
        return row[alt];
      }
    }
    return null;
  };

  const accountNumber = String(
    get('Account Number', 'ACCOUNT NUMBER', 'accountNumber', 'Account', 'account') || ''
  ).trim();

  if (!accountNumber) {
    return null; // Skip rows without account number
  }

  return {
    accountNumber,
    ownerName: String(get('Owner Name', 'OWNER NAME', 'ownerName', 'Owner') || '').trim(),
    propertyAddress: String(get('Property Address', 'PROPERTY ADDRESS', 'propertyAddress', 'Address') || '').trim(),
    mailingAddress: String(get('Mailing Address', 'MAILING ADDRESS', 'mailingAddress') || '').trim() || null,
    totalDue: parseFloat(get('Total Due', 'TOTAL DUE', 'totalDue', 'Amount Due') || 0),
    percentageDue: parseFloat(get('Percentage Due', 'PERCENTAGE DUE', 'percentageDue', 'Percent') || 0),
    status: String(get('Status', 'STATUS', 'status') || 'ACTIVE').toUpperCase(),
    taxYear: parseInt(get('Tax Year', 'TAX YEAR', 'taxYear', 'Year') || new Date().getFullYear()),
    legalDescription: String(get('Legal Description', 'LEGAL DESCRIPTION', 'legalDescription') || '').trim() || null,
    phoneNumbers: [],
    isNew: false,
    isRemoved: false,
    statusChanged: false,
    percentageChanged: false
  };
}

/**
 * Insert properties into PostgreSQL
 */
async function insertProperties(properties) {
  console.log(`\n💾 Inserting ${properties.length} properties into PostgreSQL...`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];

    if (!property) {
      skipped++;
      continue;
    }

    try {
      const result = await prisma.property.upsert({
        where: { accountNumber: property.accountNumber },
        update: {
          ...property,
          updatedAt: new Date()
        },
        create: property
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        inserted++;
      } else {
        updated++;
      }

      // Progress indicator
      if ((i + 1) % 100 === 0) {
        process.stdout.write(`\rProgress: ${i + 1}/${properties.length} (${((i + 1) / properties.length * 100).toFixed(1)}%)`);
      }
    } catch (error) {
      errors.push({
        accountNumber: property.accountNumber,
        error: error.message
      });
      skipped++;
    }
  }

  console.log('\n');
  return { inserted, updated, skipped, errors };
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    // Check database connection
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set in .env file');
    }

    console.log('🔌 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected\n');

    let excelFilePath;

    if (source === 'gcs') {
      // Download from Google Cloud Storage
      if (!bucketName) {
        throw new Error('GCS bucket name not provided. Use --bucket BUCKET_NAME or set GCS_BUCKET in .env');
      }

      // List files first
      const files = await listGCSFiles();

      if (files.length === 0) {
        throw new Error('No Excel files found in GCS bucket');
      }

      // Use the most recent file or specific file if provided
      const fileName = filePath || files[0].name;
      excelFilePath = await downloadFromGCS(fileName);

    } else if (source === 'local') {
      // Use local file
      if (!filePath) {
        throw new Error('Local file path not provided. Use --file path/to/file.xlsx');
      }

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      excelFilePath = filePath;
      console.log(`📁 Using local file: ${excelFilePath}\n`);

    } else {
      throw new Error(`Unknown source: ${source}. Use --source gcs or --source local`);
    }

    // Parse Excel file
    const rawData = parseExcelFile(excelFilePath);

    // Map to property objects
    console.log('🔄 Mapping data to property format...');
    const properties = rawData.map(mapRowToProperty).filter(p => p !== null);
    console.log(`✅ Mapped ${properties.length} valid properties\n`);

    // Insert into database
    const stats = await insertProperties(properties);

    // Summary
    console.log('═════════════════════════════════════════════════════');
    console.log('📊 Migration Summary');
    console.log('═════════════════════════════════════════════════════');
    console.log(`✅ Inserted:  ${stats.inserted}`);
    console.log(`🔄 Updated:   ${stats.updated}`);
    console.log(`⏭️  Skipped:   ${stats.skipped}`);
    console.log(`❌ Errors:    ${stats.errors.length}`);
    console.log('═════════════════════════════════════════════════════\n');

    if (stats.errors.length > 0) {
      console.log('Errors (first 10):');
      stats.errors.slice(0, 10).forEach(err => {
        console.log(`  - Account ${err.accountNumber}: ${err.error}`);
      });
    }

    // Cleanup temp file if downloaded from GCS
    if (source === 'gcs' && excelFilePath.includes('temp-download')) {
      fs.unlinkSync(excelFilePath);
    }

    console.log('✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrate();
