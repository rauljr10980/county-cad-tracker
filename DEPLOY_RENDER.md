# Deploy to Render (100% Free, No Billing Required)

**Render** is the easiest free option - no billing required, completely free tier!

## Why Render?

- ✅ **100% Free** - 750 hours/month (more than enough)
- ✅ **No billing required** - Just sign up
- ✅ **Automatic HTTPS** - Free SSL certificate
- ✅ **Easy setup** - Connect GitHub, deploy in minutes
- ✅ **Auto-deploy** - Updates on every push

**Limitation:** Sleeps after 15 min inactivity (wakes automatically on request, ~30 sec cold start)

## Step 1: Sign Up

1. Go to: https://render.com
2. Click **Get Started for Free**
3. Sign up with GitHub (easiest)

## Step 2: Create Web Service

1. Click **New +** → **Web Service**
2. **Connect your GitHub repository**:
   - Authorize Render
   - Select `county-cad-tracker` repository
   - Click **Connect**

## Step 3: Configure Service

Fill in the form:

- **Name**: `county-cad-api` (or any name you like)
- **Region**: Choose closest to you (e.g., `Oregon (US West)`)
- **Branch**: `main` (or your default branch)
- **Root Directory**: `functions` ⚠️ **Important!**
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`

## Step 4: Add Environment Variables

Click **Advanced** → **Add Environment Variable**, add:

```
GCP_PROJECT_ID = your-project-id
GCS_BUCKET = county-cad-tracker-files
PORT = 10000
```

**Replace `your-project-id` with your actual Google Cloud Project ID.**

## Step 5: Deploy

1. Click **Create Web Service**
2. Wait for deployment (2-3 minutes)
3. You'll see a URL like: `https://county-cad-api.onrender.com`
4. **Copy this URL!**

## Step 6: Grant Cloud Storage Permissions

Your Render service needs permission to access Google Cloud Storage. You have two options:

### Option A: Use Service Account Key (Recommended)

1. **Create a service account** in Google Cloud Console:
   - Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
   - Create service account with **Storage Admin** role
   - Download JSON key

2. **Add to Render Environment Variables**:
   - In Render dashboard, go to your service
   - **Environment** tab
   - Add new variable:
     ```
     GOOGLE_APPLICATION_CREDENTIALS_JSON = <paste entire JSON content>
     ```

3. **Update `functions/index.js`** to read from JSON string:

   Add this near the top (after line 8):
   ```javascript
   // Handle service account from environment variable (for Render)
   if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
     const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
     storageOptions.credentials = credentials;
   }
   ```

### Option B: Use Application Default Credentials

If you're running on Google Cloud, you can use ADC, but for Render, Option A is better.

## Step 7: Update Frontend

Create `.env.production` in project root:

```env
VITE_API_URL=https://county-cad-api.onrender.com
```

**Replace with your actual Render URL.**

## Step 8: Commit and Push

```bash
git add .env.production
git commit -m "Add Render API URL for production"
git push
```

GitHub Actions will automatically rebuild and deploy your frontend.

## Step 9: Test

1. Visit: https://rauljr10980.github.io/county-cad-tracker/
2. Go to "Upload" tab
3. Upload a file
4. Check "Files" tab - it should appear!

**Note:** First request after inactivity may take ~30 seconds (cold start). Subsequent requests are fast!

## Updating Your Backend

Render automatically redeploys when you push to GitHub! Just:

```bash
cd functions
# Make your changes
git add .
git commit -m "Update backend"
git push
```

Render will automatically rebuild and deploy.

## View Logs

1. Go to Render dashboard
2. Click on your service
3. Click **Logs** tab
4. See real-time logs

## Free Tier Limits

- ✅ **750 hours/month** - More than enough (24/7 = 730 hours)
- ✅ **512MB RAM** - Plenty for this app
- ✅ **Unlimited bandwidth** - No limits
- ✅ **Auto-sleep** - Saves hours when not in use

**You'll never exceed the free tier!**

## Troubleshooting

### "Service account key not found"
- Make sure you added `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable
- Paste the **entire JSON content** (not just the file path)

### "Bucket not found"
- Verify bucket name in environment variables
- Check bucket exists in Google Cloud Console

### "Permission denied"
- Make sure service account has **Storage Admin** role
- Verify the JSON key is correct

### Slow first request
- Normal! Render sleeps after 15 min inactivity
- First request wakes it up (~30 seconds)
- Subsequent requests are fast

### Service keeps sleeping
- This is normal and saves your free hours
- Consider upgrading to paid plan if you need 24/7 uptime
- Or use a "ping" service to keep it awake (optional)

## Keep Service Awake (Optional)

If you want to prevent sleep, you can use a free service like:
- **UptimeRobot**: https://uptimerobot.com (free tier: 50 monitors)
- Set it to ping your Render URL every 5 minutes

But this isn't necessary - the service wakes automatically when needed.

## That's It!

Your backend is now running on Render for **completely free** with no billing required! 🎉

