# Cloud Storage Only Setup (No Firestore)

This setup uses **only Google Cloud Storage** - no database needed! Everything is stored as JSON files in Cloud Storage.

## What You Need

✅ **Cloud Storage API** (already enabled!)
❌ **No Firestore needed**

## Setup Steps

### 1. Get Service Account Key

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **Create Service Account**
3. Name: `county-cad-tracker`
4. Grant role: **Storage Admin**
5. Create JSON key and download it
6. Save as: `functions/service-account-key.json`

### 2. Create Storage Bucket

Go to: https://console.cloud.google.com/storage

1. Click **Create Bucket**
2. Name: `county-cad-tracker-files`
3. Location: `us-central1`
4. Click **Create**

### 3. Configure

Create `functions/.env`:
```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=your-project-id
GCS_BUCKET=county-cad-tracker-files
```

### 4. Install & Run

```bash
cd functions
npm install
npm run serve
```

## How It Works

All data is stored in Cloud Storage as JSON files:

```
your-bucket/
├── uploads/                    # Original Excel files
│   └── {timestamp}_{filename}
├── metadata/files/             # File metadata
│   └── {fileId}.json
├── data/properties/            # Extracted properties
│   └── {fileId}.json
└── data/comparisons/           # Comparison reports
    └── {fileId}.json
```

## Benefits

- ✅ **No database needed** - just Cloud Storage
- ✅ **Simple** - everything is JSON files
- ✅ **Cheaper** - Cloud Storage is very affordable
- ✅ **Scalable** - handles large files easily

## Cost

Cloud Storage pricing:
- **5 GB free** (first 5 GB)
- **$0.026 per GB/month** after that
- **$0.12 per GB** for downloads

For typical usage (100 files, 5MB each = 500MB):
- **Cost: FREE** ✅ (within free tier)

## That's It!

No Firestore, no database - just Cloud Storage! 🎉

