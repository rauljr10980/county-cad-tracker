# Quick Fix: Upload Not Working on GitHub Pages

## The Problem

Your frontend at https://rauljr10980.github.io/county-cad-tracker/#upload is trying to connect to:
- `https://county-cad-tracker-production.up.railway.app`

But this backend is **not accessible** (timeout error).

## The Solution

You need to deploy your backend to Railway. Here's the fastest way:

## Fastest Method (5 minutes)

### 1. Go to Railway
- Visit: https://railway.app
- Login with GitHub

### 2. Create New Project
- Click "New Project"
- Select "Deploy from GitHub repo"
- Choose your `county-cad-tracker` repository

### 3. Configure Service
- **Root Directory**: Set to `functions` (IMPORTANT!)
- Railway will auto-detect Node.js

### 4. Add Database
- Click "New" → "Database" → "Add PostgreSQL"
- Railway auto-sets `DATABASE_URL`

### 5. Get Your URL
- Railway → Your Service → Settings
- Find "Public Domain" or click "Generate Domain"
- Copy the URL (e.g., `https://county-cad-tracker-abc123.up.railway.app`)

### 6. Update Frontend
Edit `.github/workflows/deploy.yml` line 38:
```yaml
VITE_API_URL: https://YOUR-RAILWAY-URL.up.railway.app
```

Replace `YOUR-RAILWAY-URL` with your actual Railway URL.

### 7. Commit and Push
```bash
git add .github/workflows/deploy.yml
git commit -m "Update Railway backend URL"
git push
```

GitHub Actions will automatically rebuild and redeploy your frontend with the correct backend URL.

## Alternative: Use Local Backend for Testing

If you want to test locally first:

1. **Start backend locally** (already done - running on port 8080)
2. **Update frontend locally** to use `http://localhost:8080`
3. **Test uploads locally**
4. **Then deploy to Railway** for production

## Verify It's Working

After deploying to Railway:

1. **Test Railway backend:**
   ```bash
   curl https://your-railway-url.up.railway.app/health
   ```
   Should return: `{"status":"healthy"}`

2. **Test your website:**
   - Go to https://rauljr10980.github.io/county-cad-tracker/#upload
   - Open browser DevTools (F12) → Console
   - Look for: `[API] Using API URL: https://your-railway-url...`
   - Try uploading a file

## Still Having Issues?

1. **Check Railway logs:**
   - Railway Dashboard → Your Service → Deployments → View Logs
   - Look for errors

2. **Check browser console:**
   - F12 → Console tab
   - Look for error messages

3. **Verify CORS:**
   - Make sure Railway backend allows `https://rauljr10980.github.io`
   - Check `functions/src/index.js` CORS configuration

## Quick Checklist

- [ ] Railway account created
- [ ] Backend deployed to Railway
- [ ] PostgreSQL database added
- [ ] Got Railway public URL
- [ ] Updated `.github/workflows/deploy.yml` with Railway URL
- [ ] Committed and pushed changes
- [ ] GitHub Actions finished deploying
- [ ] Tested upload on GitHub Pages site

---

**Need more details?** See `DEPLOY_BACKEND_TO_RAILWAY.md` for complete instructions.


