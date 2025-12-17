# Google Cloud API Setup (Direct API Method)

This guide shows you how to use Google Cloud APIs directly with API keys/service accounts.

## Quick Setup

### Step 1: Get Service Account Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **IAM & Admin** > **Service Accounts**
3. Click **Create Service Account**
4. Name: `county-cad-tracker-service`
5. Grant roles:
   - ✅ **Storage Admin** (for file uploads)
   - ✅ **Cloud Datastore User** (for Firestore)
6. Click **Create Key** > **JSON**
7. **Save the file** as `functions/service-account-key.json`

### Step 2: Enable APIs

Go to **APIs & Services** > **Library** and enable:
- ✅ Cloud Storage API
- ✅ Cloud Firestore API
- ✅ Cloud Functions API

### Step 3: Create Storage Bucket

```bash
# Using gcloud CLI
gsutil mb -p your-project-id -l us-central1 gs://county-cad-tracker-files

# Or via console: https://console.cloud.google.com/storage
```

### Step 4: Configure Backend

1. Copy service account JSON to `functions/service-account-key.json`
2. Create `functions/.env`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
   GCP_PROJECT_ID=your-project-id
   GCS_BUCKET=county-cad-tracker-files
   ```

### Step 5: Install & Run

```bash
cd functions
npm install

# Test locally
npm run serve

# Or deploy
firebase deploy --only functions
```

## Alternative: Using API Key (Client-Side)

If you want to use API keys for client-side access:

1. **APIs & Services** > **Credentials** > **Create Credentials** > **API Key**
2. Restrict to:
   - **HTTP referrers**: `http://localhost:8080/*`, `https://yourdomain.com/*`
   - **APIs**: Cloud Storage API
3. Add to `.env`:
   ```env
   VITE_GOOGLE_CLOUD_API_KEY=your-api-key-here
   ```

## Security Notes

⚠️ **Important**:
- **Service Account JSON**: Keep secret! Never commit to git
- **API Keys**: Restrict by domain/IP
- Both are already in `.gitignore`

## Testing

```bash
# Test storage access
node -e "
const { Storage } = require('@google-cloud/storage');
const storage = new Storage({
  keyFilename: './service-account-key.json',
  projectId: 'your-project-id'
});
storage.getBuckets().then(console.log);
"
```

## Troubleshooting

**"Permission denied"**
- Check service account has correct roles
- Verify JSON file path is correct

**"API not enabled"**
- Enable APIs in Google Cloud Console
- Wait a few minutes for propagation

**"Bucket not found"**
- Create bucket first
- Check bucket name matches in `.env`

