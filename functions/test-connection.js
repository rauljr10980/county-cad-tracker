// Quick test script to check Google Cloud connection
require('dotenv').config();
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');

const projectId = process.env.GCP_PROJECT_ID || 'rbmcounty-cad-tracker';
const bucketName = process.env.GCS_BUCKET || 'county-cad-tracker-files';
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json';

console.log('Testing Google Cloud Storage connection...');
console.log('Project ID:', projectId);
console.log('Bucket:', bucketName);
console.log('Key file:', keyFile);
console.log('Key file exists:', fs.existsSync(keyFile));
console.log('');

const storageOptions = { projectId };
if (fs.existsSync(keyFile)) {
  storageOptions.keyFilename = keyFile;
  console.log('Using key file for authentication');
} else {
  console.log('Key file not found, using Application Default Credentials');
}

const storage = new Storage(storageOptions);
const bucket = storage.bucket(bucketName);

// Test bucket access
bucket.exists()
  .then(([exists]) => {
    if (exists) {
      console.log('✅ Bucket exists and is accessible!');
      process.exit(0);
    } else {
      console.log('❌ Bucket does NOT exist!');
      console.log(`   Create it at: https://console.cloud.google.com/storage`);
      console.log(`   Bucket name: ${bucketName}`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.log('❌ Error accessing bucket:');
    console.log('   Message:', error.message);
    if (error.message.includes('permission')) {
      console.log('   → Service account needs Storage Admin role');
    } else if (error.message.includes('not found')) {
      console.log('   → Bucket does not exist');
    }
    process.exit(1);
  });

