# Testing File Upload

## Quick Test Setup

### Option 1: Test Frontend Only (See UI)

The frontend is starting. Once it's running:

1. Open: http://localhost:8080
2. Go to "Upload" tab
3. Try dropping a file
4. You'll see the upload UI, but it will fail without backend

### Option 2: Full Test (With Backend)

**You need:**
- Service account key: `functions/service-account-key.json`
- Config file: `functions/.env`
- Storage bucket created

**Then:**
1. Start backend: `cd functions && npm run serve`
2. Start frontend: `npm run dev` (already running)
3. Upload a file at: http://localhost:8080

## Current Status

- ✅ Frontend starting...
- ❌ Backend needs Google Cloud setup
- ❌ Service account key needed
- ❌ Storage bucket needed

## What Will Happen

**Without backend:**
- Upload UI will show
- File selection will work
- Upload will fail (connection error)

**With backend (after setup):**
- File uploads to Google Cloud Storage
- File gets processed
- Properties extracted
- Comparison generated

## Next Steps

1. **Get service account key** (see SETUP_STEPS.md)
2. **Create storage bucket**
3. **Create `functions/.env`**
4. **Start backend:** `cd functions && npm run serve`
5. **Test upload!**

