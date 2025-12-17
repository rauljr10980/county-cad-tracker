# Troubleshoot Render Deployment

## If Service "Not Loading"

### Step 1: Check Service Status

1. Go to: https://dashboard.render.com
2. Click on your `county-cad-tracker` service
3. Look at the top - what does it say?
   - **"Live"** = Service is running (might be slow first request)
   - **"Building"** = Still deploying (wait 2-3 minutes)
   - **"Deploy failed"** = There's an error (check logs)
   - **"Sleeping"** = Normal for free tier (first request wakes it)

### Step 2: Check Logs

1. In Render dashboard, click **"Logs"** tab
2. Look for:
   - **Errors** (red text)
   - **"Your service is live"** message
   - **"[STORAGE] Using service account credentials"** message

### Step 3: Common Issues

#### Issue: "Service is sleeping"
- **Solution:** Wait 30-60 seconds after first request
- Free tier sleeps after 15 min inactivity
- First request wakes it up (takes time)

#### Issue: "Building" or "Deploy failed"
- **Check logs** for specific error
- Common errors:
  - Missing environment variables
  - Invalid JSON in service account key
  - Build command failed

#### Issue: "Cannot GET /" or 404
- **This is normal!** Root path doesn't have a route
- Try: `/api/debug/test-connection` instead

#### Issue: Timeout or "Service unavailable"
- Service might be crashing
- Check logs for errors
- Verify all environment variables are set

## Quick Fixes

### If service keeps crashing:
1. Check environment variables are correct
2. Verify service account JSON is complete
3. Check logs for specific error message

### If first request is slow:
- Normal for free tier
- Service sleeps after inactivity
- Wait 30-60 seconds

### If service won't start:
1. Check **Build Command**: Should be `npm install`
2. Check **Start Command**: Should be `node index.js`
3. Check **Root Directory**: Should be `functions`
4. Check logs for build errors

