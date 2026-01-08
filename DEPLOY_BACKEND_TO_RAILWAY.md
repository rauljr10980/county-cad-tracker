# Deploy Backend to Railway - Quick Guide

Your frontend is deployed to GitHub Pages, but the backend needs to be deployed to Railway for uploads to work.

## Step 1: Sign Up / Login to Railway

1. Go to https://railway.app
2. Sign up or login with GitHub
3. Click "New Project"

## Step 2: Deploy Backend Service

### Option A: Deploy from GitHub (Recommended)

1. In Railway dashboard, click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `county-cad-tracker` repository
4. Railway will detect it's a Node.js project
5. **Important**: Set the **Root Directory** to `functions`
   - Go to Settings → Root Directory → Set to `functions`

### Option B: Deploy from Local Code

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login:
   ```bash
   railway login
   ```

3. Initialize and deploy:
   ```bash
   cd functions
   railway init
   railway up
   ```

## Step 3: Add PostgreSQL Database

1. In Railway dashboard, click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically:
   - Create the database
   - Set `DATABASE_URL` environment variable
   - Link it to your backend service

## Step 4: Configure Environment Variables

In Railway → Your Backend Service → Variables, make sure you have:

- ✅ `DATABASE_URL` - Automatically set by Railway when you add PostgreSQL
- ✅ `PORT` - Railway sets this automatically (usually 8080)
- ✅ `NODE_ENV=production` - Optional but recommended

## Step 5: Update Build Settings

In Railway → Your Backend Service → Settings:

1. **Root Directory**: Set to `functions`
2. **Build Command**: `npm install && npx prisma generate`
3. **Start Command**: `npx prisma migrate deploy && node src/index.js`

Or use the `railway:start` script from package.json:
- **Start Command**: `npm run railway:start`

## Step 6: Get Your Railway URL

After deployment:
1. Go to Railway → Your Service → Settings
2. Find "Public Domain" or "Generate Domain"
3. Copy the URL (e.g., `https://your-service-name.up.railway.app`)

## Step 7: Update Frontend to Use Your Railway URL

### Option A: Update GitHub Actions (Recommended)

Edit `.github/workflows/deploy.yml`:

```yaml
- name: Build
  run: npm run build
  env:
    NODE_ENV: production
    VITE_API_URL: https://YOUR-RAILWAY-URL.up.railway.app  # Replace with your Railway URL
```

Then commit and push:
```bash
git add .github/workflows/deploy.yml
git commit -m "Update Railway backend URL"
git push
```

This will trigger a new deployment with the correct backend URL.

### Option B: Update Code Directly

Edit `src/lib/api.ts` and replace:
```typescript
return 'https://county-cad-tracker-production.up.railway.app';
```

With your Railway URL:
```typescript
return 'https://YOUR-RAILWAY-URL.up.railway.app';
```

Then rebuild and redeploy.

## Step 8: Verify Deployment

1. **Test Railway backend:**
   ```bash
   curl https://YOUR-RAILWAY-URL.up.railway.app/health
   ```
   Should return: `{"status":"healthy",...}`

2. **Test from browser:**
   - Open your GitHub Pages site
   - Open browser DevTools (F12) → Console
   - Look for: `[API] Using API URL: https://YOUR-RAILWAY-URL...`
   - Try uploading a file

## Troubleshooting

### "Service not found" or timeout
- Check Railway dashboard → Deployments → Logs
- Make sure the service is running (not paused)
- Verify the URL is correct

### "Database connection error"
- Check `DATABASE_URL` is set in Railway Variables
- Verify PostgreSQL service is running
- Check Railway logs for connection errors

### "CORS error" in browser
- Railway backend CORS is configured to allow GitHub Pages
- If you see CORS errors, check `functions/src/index.js` CORS settings
- Make sure `https://rauljr10980.github.io` is in allowed origins

### Build fails
- Check Railway → Build logs
- Make sure Root Directory is set to `functions`
- Verify all dependencies are in `functions/package.json`

## Quick Checklist

- [ ] Railway account created
- [ ] Backend service deployed to Railway
- [ ] PostgreSQL database added
- [ ] `DATABASE_URL` environment variable set
- [ ] Railway service is running (check dashboard)
- [ ] Got Railway public URL
- [ ] Updated frontend with Railway URL
- [ ] Frontend redeployed to GitHub Pages
- [ ] Tested upload from GitHub Pages site

## Need Help?

1. Check Railway logs: Railway Dashboard → Your Service → Deployments → View Logs
2. Check browser console: F12 → Console tab
3. Test Railway URL directly: `curl https://your-url.railway.app/health`


