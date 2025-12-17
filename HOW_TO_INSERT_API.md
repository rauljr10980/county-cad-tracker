# How to Insert Your Google Cloud API

## Quick Steps

### 1. Get Your Service Account Key (Backend)

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **Create Service Account**
3. Name: `county-cad-tracker`
4. Click **Create and Continue**
5. Add roles:
   - **Storage Admin**
   - **Cloud Datastore User**
6. Click **Done**
7. Click on the service account you just created
8. Go to **Keys** tab
9. Click **Add Key** > **Create new key** > **JSON**
10. **Download the JSON file**

### 2. Insert the Key File

1. Save the downloaded JSON file as: `functions/service-account-key.json`
2. Create `functions/.env` file:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
   GCP_PROJECT_ID=your-project-id-here
   GCS_BUCKET=county-cad-tracker-files
   ```
3. Replace `your-project-id-here` with your actual Google Cloud Project ID

### 3. Enable APIs

Go to: https://console.cloud.google.com/apis/library

Enable these:
- ✅ **Cloud Storage API**
- ✅ **Cloud Firestore API**

### 4. Create Storage Bucket

Go to: https://console.cloud.google.com/storage

1. Click **Create Bucket**
2. Name: `county-cad-tracker-files`
3. Location: `us-central1` (or your preferred region)
4. Click **Create**

### 5. Done!

The code will automatically use your service account credentials. No API keys needed in the code - just the JSON file!

## File Structure

```
your-project/
├── functions/
│   ├── service-account-key.json  ← Your downloaded JSON file
│   ├── .env                       ← Your configuration
│   └── index.js                   ← Already configured!
└── .env                           ← Frontend config (optional)
```

## That's It!

The backend code is already set up to use your service account. Just:
1. ✅ Download the JSON key file
2. ✅ Put it in `functions/service-account-key.json`
3. ✅ Create `functions/.env` with your project ID
4. ✅ Enable APIs
5. ✅ Create bucket

No code changes needed!

