# Ready to Deploy! 🚀

## ✅ What's Done

- ✅ Service account created: `county-cad-tracker`
- ✅ Storage Admin role granted
- ✅ Config file created: `functions/.env`
- ✅ Project ID: `tax-delinquent-software`

## ⏳ What's Left

### 1. Create Storage Bucket (2 min)

**Go to:** https://console.cloud.google.com/storage

1. Click **"Create Bucket"**
2. **Name:** `county-cad-tracker-files`
3. **Location:** `us-central1`
4. Click **"Create"**

### 2. Deploy Backend

```bash
cd functions
firebase deploy --only functions
```

**You'll get a URL like:**
```
https://us-central1-tax-delinquent-software.cloudfunctions.net/api
```

### 3. Update Production API URL

**Create `.env.production` in project root:**
```env
VITE_API_URL=https://us-central1-tax-delinquent-software.cloudfunctions.net/api
```

(Replace with the actual URL from step 2)

### 4. Rebuild and Push

```bash
npm run build
git add .
git commit -m "Add production API URL"
git push
```

## Your Live Site

After deployment, your site at:
**https://rauljr10980.github.io/county-cad-tracker/**

Will be able to upload files! 🎉

## Quick Commands

```bash
# 1. Create bucket (via console, then...)
# 2. Deploy backend
cd functions
firebase deploy --only functions

# 3. Create .env.production (with the URL from step 2)
# 4. Rebuild
cd ..
npm run build

# 5. Push to GitHub
git add .
git commit -m "Deploy backend and update API URL"
git push
```

## Almost There! 🎯

Just create the bucket and deploy!

