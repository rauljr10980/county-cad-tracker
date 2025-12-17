# Render Deployment Steps - Your Specific Setup

## ✅ What We Have
- **Project ID**: `rbmcounty-cad-tracker`
- **Bucket Name**: `rbmcounty-cad-tracker-files`
- **Render Account**: ✅ Signed up

## Step 1: Get Service Account Key (If You Don't Have It)

### Option A: Check if you already have it

Look for this file: `functions/service-account-key.json`

**If you have it:** Skip to Step 2

**If you don't have it:** Follow Option B below

### Option B: Create Service Account Key (2 minutes)

1. **Go to Service Accounts:**
   https://console.cloud.google.com/iam-admin/serviceaccounts?project=rbmcounty-cad-tracker

2. **Click "Create Service Account"**

3. **Fill in:**
   - Service account name: `render-service`
   - Click "Create and Continue"

4. **Grant Role:**
   - Select: **Storage Admin**
   - Click "Continue" then "Done"

5. **Create Key:**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose **JSON**
   - Click "Create" (file will download)

6. **Save the file:**
   - Save it as: `functions/service-account-key.json`
   - **Important:** Keep this file secret! Don't commit it to git.

## Step 2: Set Up Render

### 2.1 Create Web Service

1. Go to: https://dashboard.render.com
2. Click **New +** → **Web Service**
3. **Connect GitHub:**
   - Click "Connect account" if not connected
   - Select your `county-cad-tracker` repository
   - Click "Connect"

### 2.2 Configure Service

Fill in these exact values:

- **Name**: `county-cad-api` (or any name you like)
- **Region**: Choose closest to you (e.g., `Oregon (US West)`)
- **Branch**: `main` (or your default branch)
- **Root Directory**: `functions` ⚠️ **IMPORTANT!**
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`

### 2.3 Add Environment Variables

Click **Advanced** → Scroll to **Environment Variables**

Add these **3 variables**:

```
GCP_PROJECT_ID = rbmcounty-cad-tracker
```

```
GCS_BUCKET = rbmcounty-cad-tracker-files
```

```
PORT = 10000
```

### 2.4 Add Service Account Key

**Important:** You need to add your service account JSON as an environment variable.

1. **Open your service account key file:**
   - Open `functions/service-account-key.json`
   - Copy the **entire contents** (all of it, including the curly braces)

2. **In Render, add this environment variable:**
   - Key: `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   - Value: Paste the **entire JSON content** (all of it)

   **Example of what it should look like:**
   ```
   {
     "type": "service_account",
     "project_id": "rbmcounty-cad-tracker",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "...",
     "client_id": "...",
     "auth_uri": "...",
     "token_uri": "...",
     ...
   }
   ```

   ⚠️ **Important:** Paste the ENTIRE JSON, including all the curly braces and quotes.

### 2.5 Deploy

1. Click **Create Web Service**
2. Wait for deployment (2-3 minutes)
3. You'll see logs scrolling - wait for "Your service is live!"
4. **Copy the URL** (looks like: `https://county-cad-api.onrender.com`)

## Step 3: Update Frontend

1. **Create `.env.production` file** in project root (same level as `package.json`):

   ```env
   VITE_API_URL=https://county-cad-api.onrender.com
   ```

   **Replace `county-cad-api.onrender.com` with your actual Render URL!**

2. **Commit and push:**
   ```bash
   git add .env.production
   git commit -m "Add Render API URL for production"
   git push
   ```

   GitHub Actions will automatically rebuild and deploy your frontend.

## Step 4: Test

1. Visit: https://rauljr10980.github.io/county-cad-tracker/
2. Open browser DevTools (F12) → Network tab
3. Go to "Upload" tab
4. Upload a test file
5. Check Network tab - you should see request to your Render URL
6. Check "Files" tab - your file should appear!

## Troubleshooting

### "Permission denied" error
- Make sure service account has **Storage Admin** role
- Verify the JSON key is correct in Render environment variables

### "Bucket not found"
- Verify bucket name: `rbmcounty-cad-tracker-files`
- Check it exists in Google Cloud Console

### Service account JSON error
- Make sure you pasted the **entire JSON** (including `{` and `}`)
- No extra spaces or line breaks
- Should start with `{` and end with `}`

### Slow first request
- Normal! Render sleeps after 15 min inactivity
- First request wakes it (~30 seconds)
- Subsequent requests are fast

## Quick Reference

**Your Values:**
- Project ID: `rbmcounty-cad-tracker`
- Bucket: `rbmcounty-cad-tracker-files`
- Render URL: `https://your-service-name.onrender.com` (you'll get this after deploy)

**Environment Variables in Render:**
1. `GCP_PROJECT_ID` = `rbmcounty-cad-tracker`
2. `GCS_BUCKET` = `rbmcounty-cad-tracker-files`
3. `PORT` = `10000`
4. `GOOGLE_APPLICATION_CREDENTIALS_JSON` = `<your entire JSON key>`

That's it! Once deployed, your backend will be live and free! 🎉

