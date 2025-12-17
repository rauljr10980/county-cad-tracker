# Setup WITHOUT Service Account Key File

Your organization blocks service account key creation. **No problem!** We can use Application Default Credentials (ADC) instead.

## ✅ Good News

**You DON'T need a service account key file!**

When you deploy to Cloud Functions, it automatically uses the default service account with the right permissions.

## What You Need Instead

### 1. Grant Permissions to Default Service Account

**Go to:** https://console.cloud.google.com/iam-admin/iam

1. Find the service account: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`
   - Or look for: `App Engine default service account`
2. Click the pencil icon (Edit)
3. Click **"Add Another Role"**
4. Add: **Storage Admin**
5. Click **"Save"**

### 2. Create Storage Bucket

**Go to:** https://console.cloud.google.com/storage

1. Click **"Create Bucket"**
2. Name: `county-cad-tracker-files`
3. Location: `us-central1`
4. Click **"Create"**

### 3. Create Config File (No Key File Needed!)

**Create `functions/.env`:**
```env
GCP_PROJECT_ID=your-project-id-here
GCS_BUCKET=county-cad-tracker-files
```

**That's it!** No `GOOGLE_APPLICATION_CREDENTIALS` needed.

### 4. Deploy Backend

```bash
cd functions
firebase deploy --only functions
```

Cloud Functions will automatically use the default service account!

## How It Works

- **Local development:** Uses Application Default Credentials (if you're logged in with `gcloud auth application-default login`)
- **Deployed:** Uses the default Cloud Functions service account automatically
- **No key file needed!** ✅

## Quick Checklist

- [ ] Grant **Storage Admin** to default service account
- [ ] Create storage bucket: `county-cad-tracker-files`
- [ ] Create `functions/.env` (just Project ID and bucket name)
- [ ] Deploy: `firebase deploy --only functions`
- [ ] Done! ✅

## For Local Testing (Optional)

If you want to test locally, you can use:

```bash
gcloud auth application-default login
```

This lets you test locally without a key file.

