require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');

if (!process.env.GCP_PROJECT_ID) {
  console.error('❌ ERROR: GCP_PROJECT_ID environment variable is not set');
  process.exit(1);
}

const storageOptions = { projectId: process.env.GCP_PROJECT_ID };
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

if (!process.env.GCS_BUCKET) {
  console.error('❌ ERROR: GCS_BUCKET environment variable is not set');
  process.exit(1);
}

const storage = new Storage(storageOptions);
const bucket = storage.bucket(process.env.GCS_BUCKET);

async function test() {
  try {
    console.log('Testing listFiles with empty prefix...');
    const [files] = await bucket.getFiles({ prefix: 'metadata/files/' });
    console.log('âœ… Success! Files found:', files.length);
    console.log('File names:', files.map(f => f.name));
  } catch (error) {
    console.log('âŒ Error:', error.message);
    console.log('Stack:', error.stack);
  }
}

test();
