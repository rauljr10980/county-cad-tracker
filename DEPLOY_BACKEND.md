# Deploy Backend to Google Cloud Functions

Since your frontend is already live on GitHub Pages, you need to deploy the backend separately.

## Steps to Deploy Backend

### 1. Complete Google Cloud Setup

**You need:**
- ✅ Service account key: `functions/service-account-key.json`
- ✅ Config file: `functions/.env`
- ✅ Storage bucket created

### 2. Deploy Backend Functions

```bash
cd functions
firebase deploy --only functions
```

This will give you a URL like:
```
https://us-central1-your-project-id.cloudfunctions.net/api
```

### 3. Update Frontend API URL

**For Production (GitHub Pages):**

You need to set the API URL as an environment variable. Since GitHub Pages is static, you have two options:

**Option A: Set in build (Recommended)**
1. Create `.env.production` file:
   ```env
   VITE_API_URL=https://us-central1-your-project-id.cloudfunctions.net/api
   ```
2. Rebuild and redeploy:
   ```bash
   npm run build
   git add .
   git commit -m "Update API URL for production"
   git push
   ```

**Option B: Use GitHub Secrets (Advanced)**
- Set `VITE_API_URL` as a GitHub secret
- Update workflow to use it during build

### 4. Current Setup

Your app is configured for:
- **Base path:** `/county-cad-tracker/` (for GitHub Pages)
- **API URL:** Currently defaults to localhost

## Quick Deploy Checklist

- [ ] Get service account key
- [ ] Create storage bucket
- [ ] Create `functions/.env`
- [ ] Deploy backend: `firebase deploy --only functions`
- [ ] Copy the function URL
- [ ] Create `.env.production` with function URL
- [ ] Rebuild and push to GitHub

## Your GitHub Pages URL

Your app should be at:
```
https://rauljr10980.github.io/county-cad-tracker/
```

Once backend is deployed, file uploads will work!

