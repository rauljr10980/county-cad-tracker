# Next Steps - You're Almost Done! ✅

## ✅ What You've Completed

- ✅ Service account created: `county-cad-tracker`
- ✅ Storage Admin role granted ✅
- ✅ IAM permissions set up correctly

## What's Left

### 1. Create Storage Bucket (2 minutes)

**Go to:** https://console.cloud.google.com/storage

1. Click **"Create Bucket"**
2. **Name:** `county-cad-tracker-files`
3. **Location type:** Region
4. **Location:** `us-central1`
5. Click **"Create"**

### 2. Get Your Project ID

From your IAM page, I can see your project. To get the Project ID:

**Go to:** https://console.cloud.google.com

- Look at the top of the page
- Your **Project ID** is shown there (not the project number)
- It might be something like: `my-first-project` or similar

### 3. Create Config File

**Create `functions/.env` file:**

```env
GCP_PROJECT_ID=your-project-id-here
GCS_BUCKET=county-cad-tracker-files
```

**Replace `your-project-id-here` with your actual Project ID.**

### 4. Deploy Backend

```bash
cd functions
firebase deploy --only functions
```

### 5. Update Production API URL

After deployment, you'll get a URL like:
```
https://us-central1-your-project-id.cloudfunctions.net/api
```

**Create `.env.production` in project root:**
```env
VITE_API_URL=https://us-central1-your-project-id.cloudfunctions.net/api
```

### 6. Rebuild and Push

```bash
npm run build
git add .
git commit -m "Add production API URL"
git push
```

## Quick Checklist

- [x] Service account created ✅
- [x] Storage Admin role granted ✅
- [ ] Create storage bucket
- [ ] Get Project ID
- [ ] Create `functions/.env`
- [ ] Deploy backend
- [ ] Update production API URL
- [ ] Rebuild and push

## You're Almost There! 🎉

Just need to create the bucket and deploy!

