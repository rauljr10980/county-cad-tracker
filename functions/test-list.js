require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');

const storageOptions = { projectId: process.env.GCP_PROJECT_ID };
if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
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
