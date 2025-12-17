# Quick Test Steps - Local Setup

## ✅ Files Created (Protected from GitHub)

1. ✅ `functions/.env` - Backend configuration
2. ✅ `.env` - Frontend configuration  
3. ✅ Both are in `.gitignore` - **NEVER will be committed to GitHub**

## 📝 What You Need to Do

### Step 1: Get Service Account Key (5 min)

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **"Create Service Account"** (or use existing)
3. Name: `county-cad-tracker`
4. Grant role: **Storage Admin**
5. Click **"Keys"** tab → **"Add Key"** → **"Create new key"** → **JSON**
6. **Save the downloaded file** as: `functions/service-account-key.json`

### Step 2: Create Storage Bucket (2 min)

1. Go to: https://console.cloud.google.com/storage
2. Click **"Create Bucket"**
3. Name: `county-cad-tracker-files`
4. Location: `us-central1`
5. Click **"Create"**

### Step 3: Update `.env` Files

**Edit `functions/.env`** - Update if your project ID is different:
```env
GCP_PROJECT_ID=tax-delinquent-software  # Change if needed
```

**Edit `.env` (root)** - Already set for local testing:
```env
VITE_API_URL=http://localhost:8080  # Already correct!
```

### Step 4: Install & Run

**Terminal 1 - Start Backend:**
```bash
cd functions
npm install
npm start
```
Should see: `Server running on http://localhost:8080`

**Terminal 2 - Start Frontend:**
```bash
npm run dev
```
Should see: Frontend running (usually `http://localhost:5173`)

### Step 5: Test!

1. Open browser to frontend URL
2. Upload a test Excel file
3. Check backend terminal for logs

## 🔒 Security

✅ All sensitive files are protected:
- `functions/.env` ✅
- `.env` ✅  
- `functions/service-account-key.json` ✅
- All `*.json` files ✅

**These will NEVER be committed to GitHub!**

## 🐛 Troubleshooting

**"Permission denied" error?**
- Make sure service account has **Storage Admin** role
- Verify `service-account-key.json` is in `functions/` folder

**"Bucket not found"?**
- Check bucket name in `functions/.env` matches what you created
- Verify bucket exists in Google Cloud Console

**Frontend can't connect?**
- Make sure backend is running on port 8080
- Check `VITE_API_URL` in root `.env` is `http://localhost:8080`
- Restart frontend after changing `.env`

## 📋 Quick Checklist

- [ ] Service account key downloaded → `functions/service-account-key.json`
- [ ] Storage bucket created: `county-cad-tracker-files`
- [ ] `functions/.env` has correct `GCP_PROJECT_ID`
- [ ] Backend dependencies installed: `cd functions && npm install`
- [ ] Frontend dependencies installed: `npm install`
- [ ] Backend running: `cd functions && npm start`
- [ ] Frontend running: `npm run dev`

## 🎯 That's It!

Once you have the service account key file, you're ready to test locally!

