# Deploy Backend to Railway

Railway is a great alternative to Render with **better memory limits** on the free tier!

## Why Railway?

✅ **More memory** - Better for large Excel files  
✅ **Free tier** - $5 credit/month (usually enough for small apps)  
✅ **Auto-deploy** - Connects to GitHub  
✅ **Easy setup** - Similar to Render  

## Step 1: Sign Up for Railway

1. Go to: https://railway.app/
2. Click **"Start a New Project"**
3. Sign up with GitHub (recommended for auto-deploy)

## Step 2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository: `rauljr10980/county-cad-tracker`
4. Railway will detect it's a Node.js project

## Step 3: Configure Service

### Root Directory
- Set **Root Directory** to: `functions`
- This tells Railway where your backend code is

### Build Command
- Railway auto-detects, but you can set:
  ```
  npm install --omit=dev
  ```

### Start Command
- Railway auto-detects, but you can set:
  ```
  npm start
  ```

## Step 4: Set Environment Variables

In Railway dashboard, go to your service → **Variables** tab:

Add these environment variables:

```
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"rbmcounty-cad-tracker",...}
GCP_PROJECT_ID=rbmcounty-cad-tracker
GCS_BUCKET=rbmcounty-cad-tracker-files
PORT=8080
NODE_ENV=production
```

### How to Get GOOGLE_APPLICATION_CREDENTIALS_JSON:

1. **Get your service account JSON** (same one you used for Render)
2. **Copy the ENTIRE JSON content** (all in one line, no line breaks)
3. **Paste it as the value** for `GOOGLE_APPLICATION_CREDENTIALS_JSON`

**Important:** The JSON must be on a single line with no line breaks!

Example format:
```
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"rbmcounty-cad-tracker","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

## Step 5: Deploy

1. Railway will **auto-deploy** when you push to GitHub
2. OR click **"Deploy"** button in Railway dashboard
3. Wait for deployment to complete (check **Deployments** tab)

## Step 6: Get Your Railway URL

1. Go to your service → **Settings** tab
2. Click **"Generate Domain"** (or use custom domain)
3. Copy the URL (e.g., `https://county-cad-tracker-production.up.railway.app`)

## Step 7: Update Frontend API URL

Update your frontend to use the Railway URL:

### Option A: Update GitHub Actions (for GitHub Pages)

Edit `.github/workflows/deploy.yml`:

```yaml
- name: Build
  run: npm run build
  env:
    NODE_ENV: production
    VITE_API_URL: https://your-railway-url.up.railway.app
```

### Option B: Update .env.production

Create/update `.env.production`:

```
VITE_API_URL=https://your-railway-url.up.railway.app
```

Then commit and push.

## Railway vs Render

| Feature | Railway | Render |
|---------|---------|--------|
| Free Tier RAM | 512MB (can upgrade) | 512MB |
| Free Tier CPU | 0.5 vCPU | 0.1 CPU |
| Free Credits | $5/month | None |
| Auto-deploy | ✅ Yes | ✅ Yes |
| Custom Domain | ✅ Yes | ✅ Yes |
| Better for Large Files | ✅ Yes | ⚠️ Limited |

## Railway Pricing

- **Free**: $5 credit/month (usually enough for testing)
- **Hobby**: $5/month (512MB RAM, 0.5 vCPU)
- **Pro**: $20/month (1GB RAM, 1 vCPU)

For large Excel files, Railway's free tier is usually better than Render!

## Troubleshooting

### "Root directory not found"
- Make sure **Root Directory** is set to `functions` (not `Functions` or `function`)

### "Cannot find module"
- Check that `package.json` is in the `functions` directory
- Railway should auto-detect and install dependencies

### "Port already in use"
- Railway sets `PORT` automatically
- Make sure your code uses `process.env.PORT || 8080`

### "Out of memory"
- Railway free tier has 512MB (same as Render)
- For very large files, consider upgrading to Hobby plan ($5/month)

## Next Steps

1. ✅ Sign up for Railway
2. ✅ Connect GitHub repo
3. ✅ Set Root Directory to `functions`
4. ✅ Add environment variables
5. ✅ Deploy
6. ✅ Update frontend API URL
7. ✅ Test upload!

Your code is already compatible with Railway! 🚀

