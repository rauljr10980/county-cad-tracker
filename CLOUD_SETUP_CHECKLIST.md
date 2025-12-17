# Google Cloud Setup Checklist

## Current Status

Let's check what you've completed:

- [ ] Service Account Key downloaded
- [ ] Service Account Key saved to `functions/service-account-key.json`
- [ ] Storage Bucket created
- [ ] Configuration file created (`functions/.env`)
- [ ] Dependencies installed
- [ ] Backend tested

## Quick Setup Steps

### 1. Get Service Account Key (5 min)

**Go to:** https://console.cloud.google.com/iam-admin/serviceaccounts

1. Click **"Create Service Account"**
2. Name: `county-cad-tracker`
3. Grant role: **Storage Admin**
4. Create JSON key → Download
5. **Save as:** `functions/service-account-key.json`

### 2. Create Storage Bucket (2 min)

**Go to:** https://console.cloud.google.com/storage

1. Click **"Create Bucket"**
2. Name: `county-cad-tracker-files`
3. Location: `us-central1`
4. Click **"Create"**

### 3. Get Your Project ID

**Go to:** https://console.cloud.google.com

- Look at the top of the page
- Copy your **Project ID** (e.g., `my-project-123456`)

### 4. Create Config File

Create `functions/.env` with:
```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=your-actual-project-id-here
GCS_BUCKET=county-cad-tracker-files
```

### 5. Install & Test

```bash
cd functions
npm install
npm run serve
```

## Need Help?

Tell me which step you're on and I'll help you complete it!

