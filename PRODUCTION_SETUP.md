# Production Setup for GitHub Pages

Your app is live at: **https://rauljr10980.github.io/county-cad-tracker/**

## Current Status

✅ Frontend deployed to GitHub Pages  
❌ Backend needs to be deployed  
❌ API URL needs to be configured  

## Steps to Make File Upload Work

### 1. Deploy Backend to Google Cloud Functions

**First, complete Google Cloud setup:**
- Get service account key
- Create storage bucket
- Create `functions/.env`

**Then deploy:**
```bash
cd functions
firebase deploy --only functions
```

**You'll get a URL like:**
```
https://us-central1-your-project-id.cloudfunctions.net/api
```

### 2. Update Production API URL

**Create `.env.production` file:**
```env
VITE_API_URL=https://us-central1-your-actual-project-id.cloudfunctions.net/api
```

**Replace with your actual function URL from step 1.**

### 3. Rebuild and Deploy

```bash
npm run build
git add .
git commit -m "Add production API URL"
git push
```

GitHub Actions will automatically deploy the new build.

## Testing

1. Go to: https://rauljr10980.github.io/county-cad-tracker/
2. Try uploading a file
3. It should now work with your deployed backend!

## Quick Checklist

- [ ] Complete Google Cloud setup (service account, bucket, .env)
- [ ] Deploy backend: `firebase deploy --only functions`
- [ ] Copy the function URL
- [ ] Create `.env.production` with function URL
- [ ] Rebuild: `npm run build`
- [ ] Push to GitHub
- [ ] Test on live site!

