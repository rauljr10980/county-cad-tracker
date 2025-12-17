# Next Steps - You've Enabled Cloud Storage API! ✅

Great! You've enabled the Cloud Storage API. Here's what to do next:

## ✅ Completed
- [x] Cloud Storage API enabled

## Next Steps

### 1. Enable Firestore API (if using database)
Go to: https://console.cloud.google.com/apis/library/firestore.googleapis.com
- Click **Enable**

### 2. Get Service Account Key

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **Create Service Account**
3. Name: `county-cad-tracker`
4. Click **Create and Continue**
5. Add these roles:
   - ✅ **Storage Admin** (for file uploads)
   - ✅ **Cloud Datastore User** (for Firestore)
6. Click **Done**
7. Click on your new service account
8. Go to **Keys** tab
9. Click **Add Key** > **Create new key** > **JSON**
10. **Download the file**

### 3. Save the Key File

1. Save the downloaded JSON file as:
   ```
   functions/service-account-key.json
   ```

### 4. Create Configuration

Create `functions/.env` file:
```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=your-project-id-here
GCS_BUCKET=county-cad-tracker-files
```

Replace `your-project-id-here` with your actual Google Cloud Project ID.

### 5. Create Storage Bucket

Go to: https://console.cloud.google.com/storage

1. Click **Create Bucket**
2. Name: `county-cad-tracker-files`
3. Location: `us-central1` (or your preferred region)
4. Click **Create**

## That's It!

Once you have:
- ✅ Service account JSON file in `functions/service-account-key.json`
- ✅ `functions/.env` file created
- ✅ Storage bucket created

You can run:
```bash
cd functions
npm install
npm run serve
```

The code will automatically use your service account credentials!

