# Deploy to Google Cloud Functions (No Firebase)

## ✅ Setup Complete

- ✅ Service account: `county-cad-tracker` with Storage Admin
- ✅ Storage bucket: `county-cad-tracker-files`
- ✅ Config file: `functions/.env`
- ✅ Project ID: `tax-delinquent-software`

## Deploy Backend

### Option 1: Deploy to Cloud Functions (Gen 1)

```bash
cd functions
gcloud functions deploy api \
  --runtime nodejs18 \
  --trigger http \
  --allow-unauthenticated \
  --region us-central1 \
  --set-env-vars GCP_PROJECT_ID=tax-delinquent-software,GCS_BUCKET=county-cad-tracker-files
```

### Option 2: Deploy to Cloud Run (Recommended)

**Create `app.yaml` or use gcloud:**

```bash
cd functions
gcloud run deploy county-cad-tracker-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=tax-delinquent-software,GCS_BUCKET=county-cad-tracker-files
```

### Option 3: Deploy to Cloud Functions Gen 2

```bash
cd functions
gcloud functions deploy api \
  --gen2 \
  --runtime nodejs18 \
  --trigger http \
  --allow-unauthenticated \
  --region us-central1 \
  --set-env-vars GCP_PROJECT_ID=tax-delinquent-software,GCS_BUCKET=county-cad-tracker-files
```

## After Deployment

You'll get a URL like:
```
https://api-xxxxx-uc.a.run.app
```
or
```
https://us-central1-tax-delinquent-software.cloudfunctions.net/api
```

## Update Production API URL

Create `.env.production`:
```env
VITE_API_URL=https://your-deployed-url-here
```

## Rebuild and Push

```bash
npm run build
git add .
git commit -m "Deploy backend to Google Cloud"
git push
```

## Local Testing

```bash
cd functions
npm start
```

Server runs on: http://localhost:8080

## Prerequisites

Make sure you have:
- Google Cloud SDK installed: https://cloud.google.com/sdk/docs/install
- Authenticated: `gcloud auth login`
- Project set: `gcloud config set project tax-delinquent-software`

