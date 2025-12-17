# Google Cloud Storage - Working Code

This is the **working Google Cloud Storage initialization code** that supports multiple credential methods.

## Complete Working Code

### File: `functions/index.js` (Google Cloud Storage Setup)

```javascript
// Load environment variables from .env file (for local development)
// Only load if .env file exists (optional for production)
if (require('fs').existsSync('.env')) {
  require('dotenv').config();
}

const { Storage } = require('@google-cloud/storage');
const XLSX = require('xlsx');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const pdfParse = require('pdf-parse');

// Initialize Storage with credentials
// Supports multiple credential methods:
// 1. Service account JSON from environment variable (for Render, Railway, etc.)
// 2. Service account key file path (for local dev)
// 3. Application Default Credentials (for Cloud Run, GCP)
const storageOptions = {};
if (process.env.GCP_PROJECT_ID) {
  storageOptions.projectId = process.env.GCP_PROJECT_ID;
}

// Method 1: Service account JSON from environment variable (for free hosting like Render)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    storageOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    console.log('[STORAGE] Using service account credentials from environment variable');
  } catch (error) {
    console.error('[STORAGE] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', error.message);
  }
}
// Method 2: Service account key file path (for local dev)
else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  console.log('[STORAGE] Using service account key file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
}
// Method 3: Application Default Credentials (for Cloud Run, GCP)
else {
  console.log('[STORAGE] Using Application Default Credentials (ADC)');
}

const storage = new Storage(storageOptions);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' })); // Increase limit for file uploads

// Start server if running directly (for local testing)
const PORT = process.env.PORT || 8080;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

const BUCKET_NAME = process.env.GCS_BUCKET || 'county-cad-tracker-files';

// Helper functions for Cloud Storage JSON operations
async function saveJSON(bucket, path, data) {
  const file = bucket.file(path);
  await file.save(JSON.stringify(data, null, 2), {
    metadata: { contentType: 'application/json' },
  });
}

async function loadJSON(bucket, path) {
  try {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [data] = await file.download();
    return JSON.parse(data.toString());
  } catch (error) {
    return null;
  }
}

async function listFiles(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  return files.map(file => file.name);
}
```

## How It Works

### Three Credential Methods (in order of priority):

1. **Environment Variable (JSON String)** - For Render, Railway, etc.
   - Uses `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable
   - Contains the full service account JSON as a string
   - Best for free hosting platforms

2. **Key File Path** - For local development
   - Uses `GOOGLE_APPLICATION_CREDENTIALS` environment variable
   - Points to the path of the service account JSON file
   - Example: `./service-account-key.json`

3. **Application Default Credentials (ADC)** - For Google Cloud Run, GCP
   - Automatically uses credentials from the environment
   - Works when running on Google Cloud infrastructure
   - No configuration needed

## Environment Variables

### For Local Development (`functions/.env`):
```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=rbmcounty-cad-tracker
GCS_BUCKET=rbmcounty-cad-tracker-files
```

### For Render (Environment Variables in Render Dashboard):
```
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"rbmcounty-cad-tracker",...}
GCP_PROJECT_ID=rbmcounty-cad-tracker
GCS_BUCKET=rbmcounty-cad-tracker-files
PORT=10000
```

## Usage Example

```javascript
// Get bucket
const bucket = storage.bucket(BUCKET_NAME);

// Save JSON file
await saveJSON(bucket, 'metadata/files/123.json', { id: '123', name: 'test' });

// Load JSON file
const data = await loadJSON(bucket, 'metadata/files/123.json');

// List files
const files = await listFiles(bucket, 'metadata/files/');
```

## Why This Code Works

✅ **Flexible**: Supports 3 different credential methods  
✅ **Robust**: Falls back gracefully if one method doesn't work  
✅ **Compatible**: Works with local dev, Render, Railway, and Google Cloud Run  
✅ **Error Handling**: Logs which method is being used for debugging  

## Your Current Setup

Based on your configuration:
- **Project ID**: `rbmcounty-cad-tracker`
- **Bucket Name**: `rbmcounty-cad-tracker-files`
- **Deployment**: Render (using Method 1 - JSON from environment variable)

This code is currently deployed and working on Render! 🎉

