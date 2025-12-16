# Railway Setup Checklist - Quick Steps

Follow these steps to deploy to Railway:

## ✅ Step 1: Sign Up (2 minutes)

1. Go to: https://railway.app/
2. Click **"Start a New Project"**
3. Sign up with **GitHub** (recommended)
4. Authorize Railway to access your GitHub

## ✅ Step 2: Create Project (1 minute)

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select: `rauljr10980/county-cad-tracker`
4. Click **"Deploy Now"**

## ✅ Step 3: Configure Service (2 minutes)

1. Railway will create a service automatically
2. Click on the service name
3. Go to **Settings** tab
4. Find **"Root Directory"** setting
5. Set it to: `functions`
6. Click **Save**

## ✅ Step 4: Add Environment Variables (3 minutes)

1. In your service, go to **Variables** tab
2. Click **"New Variable"** for each:

### Variable 1: GOOGLE_APPLICATION_CREDENTIALS_JSON
- **Name**: `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- **Value**: Paste your full service account JSON (all in one line)
  - Get it from: `functions/service-account-key.json` or Render dashboard
  - Copy the ENTIRE JSON content
  - Paste as ONE line (no line breaks)

### Variable 2: GCP_PROJECT_ID
- **Name**: `GCP_PROJECT_ID`
- **Value**: `rbmcounty-cad-tracker`

### Variable 3: GCS_BUCKET
- **Name**: `GCS_BUCKET`
- **Value**: `rbmcounty-cad-tracker-files`

### Variable 4: PORT
- **Name**: `PORT`
- **Value**: `8080`

### Variable 5: NODE_ENV
- **Name**: `NODE_ENV`
- **Value**: `production`

## ✅ Step 5: Deploy (automatic)

1. Railway will auto-deploy when you push to GitHub
2. OR click **"Deploy"** button in Railway dashboard
3. Wait 2-3 minutes for deployment
4. Check **Deployments** tab for status

## ✅ Step 6: Get Your URL (1 minute)

1. Go to **Settings** tab
2. Click **"Generate Domain"**
3. Copy the URL (e.g., `https://county-cad-tracker-production.up.railway.app`)
4. **Save this URL** - you'll need it!

## ✅ Step 7: Update Frontend (I'll do this after you give me the URL)

Once you have your Railway URL, tell me and I'll:
1. Update `.github/workflows/deploy.yml` with your Railway URL
2. Commit and push the changes
3. Frontend will rebuild with new API URL

## 🎯 Quick Reference

**Your Values:**
- Project ID: `rbmcounty-cad-tracker`
- Bucket: `rbmcounty-cad-tracker-files`
- Root Directory: `functions`
- Port: `8080`

**Time Estimate:** ~10 minutes total

## Need Help?

If you get stuck at any step, tell me which step and what error you see!

