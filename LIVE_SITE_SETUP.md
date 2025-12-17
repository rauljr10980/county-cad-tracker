# Setup for Live Site

Your live website: **https://rauljr10980.github.io/county-cad-tracker/**

## Current Status

✅ Frontend deployed and live  
❌ Backend not deployed yet  
❌ File uploads won't work until backend is deployed  

## What You Need to Do

### Step 1: Deploy Backend to Google Cloud Functions

**Prerequisites:**
1. Service account key in `functions/service-account-key.json`
2. Storage bucket created: `county-cad-tracker-files`
3. Config file: `functions/.env`

**Deploy:**
```bash
cd functions
firebase deploy --only functions
```

**You'll get a URL like:**
```
https://us-central1-your-project-id.cloudfunctions.net/api
```

### Step 2: Update Production API URL

**Create `.env.production` file in project root:**
```env
VITE_API_URL=https://us-central1-your-project-id.cloudfunctions.net/api
```

Replace `your-project-id` with your actual Google Cloud Project ID.

### Step 3: Rebuild and Push

```bash
npm run build
git add .
git commit -m "Add production API URL for Google Cloud Functions"
git push
```

GitHub Actions will automatically deploy the new build to your live site.

## Testing

1. Visit: https://rauljr10980.github.io/county-cad-tracker/
2. Go to "Upload" tab
3. Try uploading a file
4. It should now work! ✅

## Quick Checklist

- [ ] Get service account key → `functions/service-account-key.json`
- [ ] Create storage bucket: `county-cad-tracker-files`
- [ ] Create `functions/.env` with your Project ID
- [ ] Deploy backend: `firebase deploy --only functions`
- [ ] Copy the function URL
- [ ] Create `.env.production` with function URL
- [ ] Rebuild: `npm run build`
- [ ] Push to GitHub
- [ ] Test on live site!

## Current Behavior

**Right now on your live site:**
- ✅ UI works perfectly
- ✅ File selection works
- ❌ Upload fails (backend not deployed)
- ❌ Error: "Failed to fetch" or connection error

**After backend deployment:**
- ✅ Everything works!
- ✅ Files upload to Google Cloud Storage
- ✅ Properties extracted
- ✅ Comparisons generated

