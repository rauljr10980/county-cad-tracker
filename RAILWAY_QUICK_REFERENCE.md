# Railway Quick Reference - Copy & Paste Values

Use these values when setting up Railway:

## Environment Variables

Copy and paste these into Railway's Variables tab:

```
GOOGLE_APPLICATION_CREDENTIALS_JSON=<paste your full service account JSON here>
GCP_PROJECT_ID=rbmcounty-cad-tracker
GCS_BUCKET=rbmcounty-cad-tracker-files
PORT=8080
NODE_ENV=production
```

## Service Configuration

- **Root Directory**: `functions`
- **Build Command**: (auto-detected, or leave blank)
- **Start Command**: (auto-detected, or leave blank)

## How to Get GOOGLE_APPLICATION_CREDENTIALS_JSON

### Option 1: From Render Dashboard
1. Go to your Render service
2. Go to **Environment** tab
3. Find `GOOGLE_APPLICATION_CREDENTIALS_JSON`
4. Copy the entire value
5. Paste into Railway

### Option 2: From Local File
1. Open `functions/service-account-key.json`
2. Copy the ENTIRE file content
3. Remove all line breaks (make it one line)
4. Paste into Railway

**Important:** The JSON must be on ONE line with no line breaks!

## After Railway is Live

Once Railway gives you a URL (e.g., `https://county-cad-tracker-production.up.railway.app`):

1. **Tell me the URL**
2. I'll update the frontend to use it
3. Frontend will rebuild automatically
4. Test upload!

## Your Current Setup

- **Project ID**: `rbmcounty-cad-tracker`
- **Bucket Name**: `rbmcounty-cad-tracker-files`
- **GitHub Repo**: `rauljr10980/county-cad-tracker`
- **Backend Directory**: `functions`

Everything is ready! Just follow the checklist in `RAILWAY_SETUP_CHECKLIST.md` 🚀

