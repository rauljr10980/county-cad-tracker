# Deploy to Google Cloud Run (FREE TIER)

This guide shows you how to deploy your backend to **Google Cloud Run** - which has a generous free tier and only charges for what you use.

## ✅ Why Cloud Run?

- **FREE TIER**: 2 million requests/month free
- **Pay per use**: Only charged when handling requests
- **No Firebase needed**: Pure Google Cloud
- **Auto-scaling**: Handles traffic automatically
- **HTTPS included**: Free SSL certificate

## Prerequisites

1. **Google Cloud Account** (with billing enabled - but you'll stay in free tier)
2. **Google Cloud SDK** installed: https://cloud.google.com/sdk/docs/install
3. **Service Account Key**: `functions/service-account-key.json`
4. **Storage Bucket**: `county-cad-tracker-files` (already created)

## Step 1: Install Google Cloud SDK

If you haven't already:

```bash
# Windows (PowerShell)
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe

# Or download from: https://cloud.google.com/sdk/docs/install
```

## Step 2: Login and Set Project

```bash
# Login to Google Cloud
gcloud auth login

# Set your project (replace with your project ID)
gcloud config set project YOUR_PROJECT_ID

# Verify
gcloud config get-value project
```

## Step 3: Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage.googleapis.com
```

Or enable via [Google Cloud Console](https://console.cloud.google.com/apis/library):
- ✅ Cloud Run API
- ✅ Cloud Build API
- ✅ Cloud Storage API

## Step 4: Build and Deploy

From the `functions` directory:

```bash
cd functions

# Build and deploy in one command
gcloud run deploy county-cad-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=YOUR_PROJECT_ID,GCS_BUCKET=county-cad-tracker-files" \
  --memory=512Mi \
  --timeout=300 \
  --max-instances=10
```

**Replace `YOUR_PROJECT_ID` with your actual Google Cloud Project ID.**

This will:
1. Build a Docker container from your code
2. Deploy it to Cloud Run
3. Give you a URL like: `https://county-cad-api-xxxxx-uc.a.run.app`

**Copy this URL** - you'll need it for the frontend!

## Step 5: Grant Cloud Run Service Account Permissions

Cloud Run needs permission to access Cloud Storage:

```bash
# Get the Cloud Run service account email
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Storage Admin role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.admin"
```

**Replace `YOUR_PROJECT_ID` with your actual project ID.**

## Step 6: Update Frontend API URL

Create `.env.production` in the **project root**:

```env
VITE_API_URL=https://county-cad-api-xxxxx-uc.a.run.app
```

Replace with your actual Cloud Run URL from Step 4.

## Step 7: Rebuild and Deploy Frontend

```bash
# From project root
npm run build

# Commit and push
git add .env.production
git commit -m "Add Cloud Run API URL for production"
git push
```

GitHub Actions will automatically deploy the updated frontend.

## Step 8: Test

1. Visit: https://rauljr10980.github.io/county-cad-tracker/
2. Go to "Upload" tab
3. Upload a file
4. Check "Files" tab - it should appear!

## Updating the Backend

To update your backend after making changes:

```bash
cd functions
gcloud run deploy county-cad-api \
  --source . \
  --platform managed \
  --region us-central1
```

## View Logs

```bash
gcloud run services logs read county-cad-api --region us-central1
```

Or view in [Cloud Run Console](https://console.cloud.google.com/run)

## Cost Estimate

**Free Tier Includes:**
- 2 million requests/month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

**For typical usage** (100 uploads/month):
- Requests: ~500/month (well under 2M free)
- Memory: ~50 GB-seconds/month (well under 360K free)
- **Cost: $0.00** ✅

You'll only pay if you exceed the free tier, which is very generous.

## Troubleshooting

### "Permission denied" errors
- Make sure you ran Step 5 (granting Storage Admin role)
- Check that the service account has permissions

### "Bucket not found"
- Verify bucket exists: `gsutil ls gs://county-cad-tracker-files`
- Check bucket name matches in env vars

### CORS errors
- Cloud Run should handle CORS (code already includes `cors()`)
- If issues persist, check the CORS settings in `functions/index.js`

### Check service status
```bash
gcloud run services describe county-cad-api --region us-central1
```

## Quick Reference

**Deploy:**
```bash
cd functions
gcloud run deploy county-cad-api --source . --region us-central1 --allow-unauthenticated
```

**View URL:**
```bash
gcloud run services describe county-cad-api --region us-central1 --format="value(status.url)"
```

**View Logs:**
```bash
gcloud run services logs read county-cad-api --region us-central1 --limit=50
```

**Delete Service:**
```bash
gcloud run services delete county-cad-api --region us-central1
```

That's it! Your backend is now running on Google Cloud Run for free! 🎉

