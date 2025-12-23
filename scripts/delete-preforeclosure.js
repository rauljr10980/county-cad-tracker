/**
 * Script to delete all preforeclosure records from Google Cloud Storage
 * Run with: node scripts/delete-preforeclosure.js
 */

const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../functions/.env') });

const BUCKET_NAME = process.env.BUCKET_NAME || 'county-cad-tracker-files';

async function deletePreForeclosureRecords() {
  try {
    console.log('Connecting to Google Cloud Storage...');
    const storage = new Storage({
      keyFilename: path.join(__dirname, '../functions/service-account-key.json'),
      projectId: process.env.GCP_PROJECT_ID,
    });

    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file('data/preforeclosure/records.json');

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.log('✓ No preforeclosure records file found. Already empty.');
      return;
    }

    // Delete the file
    await file.delete();
    console.log('✓ Successfully deleted all preforeclosure records from:', `gs://${BUCKET_NAME}/data/preforeclosure/records.json`);
  } catch (error) {
    console.error('✗ Error deleting preforeclosure records:', error.message);
    process.exit(1);
  }
}

deletePreForeclosureRecords();

