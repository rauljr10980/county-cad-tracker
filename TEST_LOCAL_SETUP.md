# Test Locally - Quick Start

## Step 1: Install Dependencies

Make sure all dependencies are installed:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd functions
npm install
cd ..
```

## Step 2: Set Up Google Cloud Authentication (Local)

For local testing, you need to authenticate with Google Cloud:

**Option A: Use Application Default Credentials (Recommended)**
```bash
gcloud auth application-default login
```

**Option B: Use Service Account Key (if you have one)**
1. Download your service account key JSON file
2. Save it as `functions/service-account-key.json`
3. Set environment variable:
   ```bash
   $env:GOOGLE_APPLICATION_CREDENTIALS="functions/service-account-key.json"
   ```

## Step 3: Start Backend

**Terminal 1:**
```bash
cd functions
npm start
```

You should see:
```
Server running on http://localhost:8080
```

## Step 4: Start Frontend

**Terminal 2 (new terminal):**
```bash
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

## Step 5: Test It!

1. Open browser: http://localhost:5173
2. Upload a file (Excel or PDF)
3. Check your Google Cloud Storage bucket - the file should appear!

## Troubleshooting

### "Permission denied" errors
- Make sure you ran `gcloud auth application-default login`
- Or set `GOOGLE_APPLICATION_CREDENTIALS` to your key file

### "Bucket not found" errors
- Make sure your bucket exists: `county-cad-tracker-files`
- Check the bucket name in `functions/index.js` (line 32)

### CORS errors
- Backend already has CORS enabled
- Make sure backend is running on port 8080
- Make sure frontend is using `VITE_API_URL=http://localhost:8080`

### Port already in use
- Backend uses port 8080
- Frontend uses port 5173
- If 8080 is taken, change it in `functions/index.js` (line 25)
- If 5173 is taken, Vite will automatically use the next available port

## What Works Locally

✅ File uploads to Google Cloud Storage
✅ File processing (Excel and PDF)
✅ Property extraction
✅ Comparison generation
✅ All API endpoints

## Next Steps

Once everything works locally:
1. Set up billing alerts (see `BILLING_SAFETY.md`)
2. Enable billing
3. Deploy to Cloud Run (see `DEPLOY_GOOGLE_CLOUD.md`)

