# Test Render Deployment

## Quick Tests

### 1. Basic Health Check
Visit: https://county-cad-tracker.onrender.com

**Expected:** Should return something (even an error means server is running)

### 2. Connection Test
Visit: https://county-cad-tracker.onrender.com/api/debug/test-connection

**Expected Response:**
```json
{
  "timestamp": "...",
  "bucket": "rbmcounty-cad-tracker-files",
  "credentials": {
    "hasKeyFile": false,
    "keyFile": "Using ADC",
    "keyFileExists": false,
    "projectId": "rbmcounty-cad-tracker"
  },
  "bucketAccess": {
    "exists": true,
    "accessible": true,
    "canList": true,
    "fileCount": 0
  },
  "summary": {
    "total": 0,
    "completed": 0,
    "processing": 0,
    "error": 0,
    "missingFiles": 0
  }
}
```

### 3. Files Endpoint
Visit: https://county-cad-tracker.onrender.com/api/files

**Expected:** Should return an empty array `[]` (or list of files if any exist)

## Common Issues

### "Cannot GET /"
- ✅ This is normal! The root path doesn't have a route
- Try the `/api/debug/test-connection` endpoint instead

### "Connection timeout" or "Service unavailable"
- Service might be spinning up (free tier sleeps after 15 min)
- Wait 30-60 seconds and try again
- Check Render logs for errors

### "Bucket not found" or "Permission denied"
- Check environment variables are set correctly
- Verify service account JSON is complete
- Check service account has Storage Admin role

### Service keeps sleeping
- Normal for free tier
- First request after sleep takes ~30 seconds
- Subsequent requests are fast

## Next Steps After Testing

If connection test works:
1. ✅ Update frontend `.env.production` with Render URL
2. ✅ Commit and push to GitHub
3. ✅ Test file upload on live site

