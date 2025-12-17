# Local Testing Setup Guide

This guide will help you set up local testing with secure environment variables that will **never be exposed** to GitHub.

## ✅ Step 1: Get Google Cloud Service Account Key (5 minutes)

1. **Go to Google Cloud Console**: https://console.cloud.google.com/iam-admin/serviceaccounts
   - Make sure you're in the project: `tax-delinquent-software`

2. **Create Service Account** (if you don't have one):
   - Click **"Create Service Account"**
   - Name: `county-cad-tracker`
   - Click **"Create and Continue"**

3. **Grant Permissions**:
   - Role: **Storage Admin**
   - Click **"Continue"** then **"Done"**

4. **Create Key**:
   - Click on the service account you just created
   - Go to **"Keys"** tab
   - Click **"Add Key"** → **"Create new key"**
   - Choose **JSON**
   - Click **"Create"** (file will download automatically)

5. **Save the Key File**:
   - Rename the downloaded file to: `service-account-key.json`
   - Move it to: `functions/service-account-key.json`
   - ⚠️ **This file contains secrets - it's already in `.gitignore`**

## ✅ Step 2: Create Storage Bucket (2 minutes)

1. **Go to**: https://console.cloud.google.com/storage
2. **Click "Create Bucket"**
3. **Fill in**:
   - Name: `county-cad-tracker-files`
   - Location type: **Region**
   - Location: `us-central1`
   - Click **"Create"**

## ✅ Step 3: Create Backend Environment File (1 minute)

1. **Copy the example file**:
   ```bash
   cd functions
   copy .env.example .env
   ```
   (Or manually create `functions/.env`)

2. **Edit `functions/.env`** and fill in:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
   GCP_PROJECT_ID=tax-delinquent-software
   GCS_BUCKET=county-cad-tracker-files
   PORT=8080
   ```

   ⚠️ **Replace `tax-delinquent-software` with your actual project ID if different**

## ✅ Step 4: Create Frontend Environment File (1 minute)

1. **Copy the example file**:
   ```bash
   copy .env.example .env
   ```
   (Or manually create `.env` in the project root)

2. **Edit `.env`** (in project root):
   ```env
   VITE_API_URL=http://localhost:8080
   ```

## ✅ Step 5: Install Dependencies (2 minutes)

```bash
# Install backend dependencies
cd functions
npm install

# Go back to root and install frontend dependencies
cd ..
npm install
```

## ✅ Step 6: Start the Backend Server

**In Terminal 1:**
```bash
cd functions
npm start
```

You should see:
```
Server running on http://localhost:8080
```

## ✅ Step 7: Start the Frontend (New Terminal)

**In Terminal 2:**
```bash
npm run dev
```

The frontend will start (usually on `http://localhost:5173` or similar)

## ✅ Step 8: Test It!

1. Open your browser to the frontend URL (shown in terminal)
2. Try uploading a test Excel file
3. Check the backend terminal for logs

## 🔒 Security Notes

✅ **All sensitive files are protected:**
- `functions/.env` - Already in `.gitignore`
- `.env` (root) - Already in `.gitignore`
- `functions/service-account-key.json` - Already in `.gitignore`
- `*.json` files - Already in `.gitignore`

✅ **These files will NEVER be committed to GitHub**

## 🐛 Troubleshooting

### "Cannot find module '@google-cloud/storage'"
```bash
cd functions
npm install
```

### "Permission denied" or "Authentication error"
- Make sure your service account has **Storage Admin** role
- Verify the JSON key file is in `functions/service-account-key.json`
- Check that `GOOGLE_APPLICATION_CREDENTIALS` in `.env` points to the correct path

### "Bucket not found"
- Make sure the bucket name in `functions/.env` matches the bucket you created
- Verify the bucket exists at: https://console.cloud.google.com/storage

### Frontend can't connect to backend
- Make sure backend is running on `http://localhost:8080`
- Check that `VITE_API_URL` in root `.env` is set to `http://localhost:8080`
- Restart the frontend after changing `.env` files

## 📝 Quick Reference

**Backend runs on:** `http://localhost:8080`
**Frontend runs on:** `http://localhost:5173` (or port shown in terminal)

**Files you created:**
- ✅ `functions/service-account-key.json` (downloaded from Google Cloud)
- ✅ `functions/.env` (copied from `.env.example`)
- ✅ `.env` (root, copied from `.env.example`)

**All of these are in `.gitignore` - safe from GitHub!** 🔒

