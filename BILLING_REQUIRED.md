# Billing Required for Deployment

## Current Issue

Google Cloud Run requires billing to be enabled. You have two options:

### Option 1: Enable Billing (Recommended)

**Go to:** https://console.developers.google.com/billing/enable?project=tax-delinquent-software

1. Enable billing on your project
2. You'll get $300 free credit for 90 days
3. After that, you only pay for what you use
4. Cloud Run is very affordable (often free tier covers small usage)

**Then deploy:**
```bash
cd functions
gcloud run deploy county-cad-tracker-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=tax-delinquent-software,GCS_BUCKET=county-cad-tracker-files
```

### Option 2: Test Locally First

You can test everything locally without billing:

```bash
cd functions
npm start
```

Then update your frontend `.env` to point to `http://localhost:8080` for local testing.

## Cost Estimate

**Cloud Run pricing:**
- **Free tier:** 2 million requests/month, 360,000 GB-seconds
- **After free tier:** ~$0.40 per million requests, $0.00002400 per GB-second

**For your use case (100 uploads/month):**
- **Cost: FREE** ✅ (well within free tier)

## Next Steps

1. **Enable billing** (if you want to deploy now)
2. **Or test locally** first to make sure everything works
3. **Then deploy** when ready

## Local Testing Setup

**Create `.env` in project root:**
```env
VITE_API_URL=http://localhost:8080
```

**Start backend:**
```bash
cd functions
npm start
```

**Start frontend (new terminal):**
```bash
npm run dev
```

Then test at: http://localhost:8080

