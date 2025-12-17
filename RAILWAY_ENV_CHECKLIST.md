# Railway Environment Variables Checklist

Your deployment crashed after 4 seconds. This is usually due to **missing environment variables**.

## Required Environment Variables

Go to Railway Dashboard → Your Service → **Variables** tab and add these:

### ✅ 1. GOOGLE_APPLICATION_CREDENTIALS_JSON
**Required:** YES  
**Value:** Your full service account JSON (all in one line, no line breaks)

**How to get it:**
1. Go to your Render dashboard (or wherever you have it)
2. Copy the `GOOGLE_APPLICATION_CREDENTIALS_JSON` value
3. Paste it into Railway

**OR** from your local file:
1. Open `functions/service-account-key.json`
2. Copy the ENTIRE content
3. Remove all line breaks (make it one long line)
4. Paste into Railway

**Format:** `{"type":"service_account","project_id":"rbmcounty-cad-tracker",...}`

### ✅ 2. GCP_PROJECT_ID
**Required:** YES  
**Value:** `rbmcounty-cad-tracker`

### ✅ 3. GCS_BUCKET
**Required:** YES  
**Value:** `rbmcounty-cad-tracker-files`

### ✅ 4. PORT
**Required:** NO (Railway sets this automatically)  
**Value:** Leave empty OR set to `8080`

### ✅ 5. NODE_ENV
**Required:** NO (optional)  
**Value:** `production`

## Quick Check

1. **Go to Railway Dashboard**
2. **Click your service**
3. **Go to Variables tab**
4. **Verify you have:**
   - ✅ `GOOGLE_APPLICATION_CREDENTIALS_JSON` (with your JSON)
   - ✅ `GCP_PROJECT_ID` = `rbmcounty-cad-tracker`
   - ✅ `GCS_BUCKET` = `rbmcounty-cad-tracker-files`

## After Adding Variables

1. Railway will **auto-redeploy** when you save variables
2. Wait for deployment to complete
3. Check **Deploy Logs** to see if it starts successfully
4. Your service should stay running (not crash after 4 seconds)

## Common Issues

### ❌ "Cannot find module '@google-cloud/storage'"
- Dependencies not installed
- **Fix:** Already fixed in latest code

### ❌ "Failed to initialize storage"
- Missing `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- **Fix:** Add the environment variable

### ❌ "Bucket does not exist"
- Wrong `GCS_BUCKET` name
- **Fix:** Verify bucket name is `rbmcounty-cad-tracker-files`

### ❌ Server crashes after 4 seconds
- Missing environment variables
- **Fix:** Add all required variables above

## Test After Fix

Once variables are set:
1. Check Railway **Deploy Logs**
2. You should see: `[STORAGE] Storage initialized successfully`
3. You should see: `Server running on http://localhost:XXXX`
4. Service should stay **Active** (green status)

If it still crashes, check the **Deploy Logs** for the exact error message!

