# Setup WITHOUT Service Account Key File ✅

Your organization blocks key creation - **that's actually more secure!** We'll use Application Default Credentials instead.

## ✅ What Changed

The code now works **without a key file**. When deployed to Cloud Functions, it automatically uses the default service account.

## What You Need to Do

### 1. Grant Permissions to Default Service Account

**Go to:** https://console.cloud.google.com/iam-admin/iam

1. Find: **App Engine default service account** or **Compute Engine default service account**
   - It looks like: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`
2. Click the **pencil icon** (Edit)
3. Click **"Add Another Role"**
4. Select: **Storage Admin**
5. Click **"Save"**

### 2. Create Storage Bucket

**Go to:** https://console.cloud.google.com/storage

1. Click **"Create Bucket"**
2. Name: `county-cad-tracker-files`
3. Location: `us-central1`
4. Click **"Create"**

### 3. Get Your Project ID

**Go to:** https://console.cloud.google.com

- Copy your **Project ID** from the top of the page

### 4. Create Config File (No Key File!)

**Create `functions/.env`:**
```env
GCP_PROJECT_ID=your-actual-project-id-here
GCS_BUCKET=county-cad-tracker-files
```

**That's it!** No service account key file needed! ✅

### 5. Deploy Backend

```bash
cd functions
firebase deploy --only functions
```

Cloud Functions will automatically use the default service account with Storage Admin permissions!

## How It Works

- **Deployed:** Uses default Cloud Functions service account automatically ✅
- **No key file needed!** ✅
- **More secure!** ✅

## Quick Checklist

- [ ] Grant **Storage Admin** to default service account (Step 1)
- [ ] Create storage bucket: `county-cad-tracker-files` (Step 2)
- [ ] Get your Project ID (Step 3)
- [ ] Create `functions/.env` with Project ID and bucket name (Step 4)
- [ ] Deploy: `firebase deploy --only functions` (Step 5)
- [ ] Done! ✅

## For Local Testing (Optional)

If you want to test locally without a key file:

```bash
gcloud auth application-default login
```

This lets you test locally using your user credentials.

## You're All Set!

No key file needed - the code is already updated to work without it! 🎉

