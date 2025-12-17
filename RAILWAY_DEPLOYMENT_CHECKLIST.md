# Railway Deployment Checklist

## Current Configuration Status

✅ **nixpacks.toml** is in `functions/` directory  
✅ **Root Directory** in Railway should be set to: `functions`  
✅ **npm install** command is in nixpacks.toml  
✅ **Server startup** code is fixed to always start  

## What to Check in Railway Dashboard

### 1. Build Logs

Go to: Railway Dashboard → Your Service → Deployments → Latest → **Build Logs**

Look for:
- ✅ `Starting npm install...`
- ✅ `Dependencies installed successfully`
- ✅ `ls -la node_modules` output showing installed packages
- ✅ Should see `@google-cloud/storage`, `express`, `cors`, `xlsx`, `pdf-parse` in node_modules

**If you DON'T see these:**
- npm install didn't run
- Check that Root Directory is set to `functions`
- Check that Build Command is empty (let nixpacks handle it)

### 2. Deploy Logs

Go to: Railway Dashboard → Your Service → Deployments → Latest → **Deploy Logs**

Look for:
- ✅ `[SERVER] Server running on port XXXX`
- ✅ `[SERVER] Environment: production`
- ✅ `[SERVER] Storage initialized: Yes`
- ✅ `[STORAGE] Storage initialized successfully`

**If you see errors:**
- `Cannot find module '@google-cloud/storage'` → npm install didn't run
- `Storage not initialized` → Missing `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var
- `Port already in use` → Railway sets PORT automatically, should be fine

### 3. Test Health Endpoint

Open in browser or use curl:
```
https://county-cad-tracker-production.up.railway.app/api/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-16T...",
  "storage": "initialized"
}
```

**If you get:**
- `502 Bad Gateway` → Server crashed or didn't start
- `Connection refused` → Server not running
- `404 Not Found` → Wrong URL or route not found
- `CORS error` → CORS configuration issue

### 4. Environment Variables

Go to: Railway Dashboard → Your Service → **Variables** tab

Verify you have:
- ✅ `GOOGLE_APPLICATION_CREDENTIALS_JSON` (full JSON, one line)
- ✅ `GCP_PROJECT_ID` = `rbmcounty-cad-tracker`
- ✅ `GCS_BUCKET` = `rbmcounty-cad-tracker-files`
- ✅ `PORT` (Railway sets this automatically, but can be `8080`)

## Common Issues & Fixes

### Issue: "Cannot find module '@google-cloud/storage'"

**Cause:** npm install didn't run or ran in wrong directory

**Fix:**
1. Check Root Directory is `functions` (not `Functions` or `function`)
2. Check Build Logs - do you see "npm install" running?
3. If not, manually set Build Command to: `npm install`

### Issue: "Storage not initialized"

**Cause:** Missing or invalid `GOOGLE_APPLICATION_CREDENTIALS_JSON`

**Fix:**
1. Go to Variables tab
2. Check `GOOGLE_APPLICATION_CREDENTIALS_JSON` exists
3. Verify it's valid JSON (all on one line, no line breaks)
4. Get it from Render dashboard or your local `service-account-key.json`

### Issue: Server crashes after 4 seconds

**Cause:** Missing environment variables or storage initialization failed

**Fix:**
1. Check Deploy Logs for error messages
2. Verify all 4 environment variables are set
3. Check that storage initializes successfully in logs

### Issue: "Failed to fetch" in frontend

**Cause:** 
- Frontend hasn't rebuilt with new Railway URL
- CORS issue
- Backend not running

**Fix:**
1. Check GitHub Actions - did frontend rebuild complete?
2. Hard refresh browser (Ctrl+Shift+R)
3. Test health endpoint directly
4. Check browser console for CORS errors

## Current nixpacks.toml Configuration

```toml
[phases.setup]
nixPkgs = ["nodejs-18_x", "npm"]

[phases.install]
cmds = [
  "echo 'Starting npm install...'",
  "npm install",
  "echo 'Dependencies installed successfully'",
  "ls -la node_modules | head -5"
]

[start]
cmd = "node index.js"
```

**Note:** This assumes Railway's Root Directory is set to `functions`, so we don't need `cd functions`.

## Next Steps

1. ✅ Check Build Logs for npm install
2. ✅ Check Deploy Logs for server startup
3. ✅ Test health endpoint
4. ✅ Verify environment variables
5. ✅ Check frontend has rebuilt with Railway URL

Share any error messages you see in the logs!

