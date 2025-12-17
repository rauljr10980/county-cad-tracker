# Fix Google Cloud Permissions

## Issue Found
Your service account doesn't have permission to access the storage bucket.

## Solution: Two Steps Required

### Step 1: Verify Service Account Has Storage Admin Role

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=rbmcounty-cad-tracker
2. Click on your service account: `rbmcounty-cad-tracker`
3. Go to **"Permissions"** tab
4. Check if **"Storage Admin"** role is listed
5. If NOT, click **"Grant Access"**:
   - In "New principals", enter: `rbmcounty-cad-tracker@rbmcounty-cad-tracker.iam.gserviceaccount.com`
   - Select role: **Storage Admin**
   - Click **"Save"**

### Step 2: Create the Storage Bucket

1. Go to: https://console.cloud.google.com/storage?project=rbmcounty-cad-tracker
2. Click **"Create Bucket"**
3. Fill in:
   - **Name**: `county-cad-tracker-files`
   - **Location type**: Region
   - **Location**: `us-central1` (or your preferred region)
   - Click **"Create"**

## After Both Steps

Run the test again:
```bash
cd functions
node test-connection.js
```

You should see: ✅ Bucket exists and is accessible!

## Quick Links

- **Service Accounts**: https://console.cloud.google.com/iam-admin/serviceaccounts?project=rbmcounty-cad-tracker
- **Storage Buckets**: https://console.cloud.google.com/storage?project=rbmcounty-cad-tracker

