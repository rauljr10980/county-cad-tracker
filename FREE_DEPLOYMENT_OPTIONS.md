# Free Deployment Options (No Billing Required)

Since you're on the free tier and don't want to enable billing, here are **completely free** alternatives to deploy your backend:

## ⚠️ About Google Cloud Billing

**Important:** Google Cloud requires billing to be enabled even for free tier services. However:
- You **won't be charged** if you stay within free tier limits
- Cloud Run free tier: 2M requests/month, 360K GB-seconds memory
- You can set up **billing alerts** to prevent unexpected charges
- You can **delete resources** anytime to stop all costs

**But if you want to avoid enabling billing entirely**, use one of these options:

---

## Option 1: Render (Recommended - Completely Free)

**Render** offers a free tier with no billing required!

### Deploy to Render:

1. **Sign up**: https://render.com (free account)

2. **Create a new Web Service**:
   - Connect your GitHub repository
   - Root Directory: `functions`
   - Build Command: `npm install`
   - Start Command: `node index.js`
   - Environment: `Node`

3. **Add Environment Variables**:
   ```
   GCP_PROJECT_ID=your-project-id
   GCS_BUCKET=county-cad-tracker-files
   PORT=10000
   ```

4. **Deploy!** Render will give you a URL like:
   ```
   https://county-cad-api.onrender.com
   ```

5. **Update `.env.production`**:
   ```env
   VITE_API_URL=https://county-cad-api.onrender.com
   ```

**Free Tier:**
- ✅ 750 hours/month free
- ✅ Automatic HTTPS
- ✅ Sleeps after 15 min inactivity (wakes on request)
- ✅ No billing required

**Limitation:** First request after sleep takes ~30 seconds (cold start)

---

## Option 2: Railway (Free Tier)

**Railway** offers $5 free credit monthly (no billing required for free tier).

1. **Sign up**: https://railway.app
2. **New Project** → **Deploy from GitHub**
3. **Select your repo** → **Root Directory**: `functions`
4. **Add Environment Variables**:
   ```
   GCP_PROJECT_ID=your-project-id
   GCS_BUCKET=county-cad-tracker-files
   ```
5. **Deploy!** Get your URL and update `.env.production`

**Free Tier:**
- ✅ $5 credit/month (usually enough for small apps)
- ✅ No billing required for free tier
- ✅ Fast deployments

---

## Option 3: Fly.io (Free Tier)

**Fly.io** has a generous free tier.

1. **Install Fly CLI**: https://fly.io/docs/getting-started/installing-flyctl/
2. **Sign up**: `fly auth signup`
3. **Create app**: `fly launch` (in `functions` directory)
4. **Deploy**: `fly deploy`
5. **Get URL** and update `.env.production`

**Free Tier:**
- ✅ 3 shared-cpu VMs free
- ✅ 3GB persistent storage free
- ✅ No billing required for free tier

---

## Option 4: Local Development + ngrok (For Testing)

If you just want to test, you can run locally and expose it:

1. **Run backend locally**:
   ```bash
   cd functions
   npm start
   ```

2. **Install ngrok**: https://ngrok.com/download

3. **Expose local server**:
   ```bash
   ngrok http 8080
   ```

4. **Get ngrok URL** (like `https://abc123.ngrok.io`)

5. **Update `.env.production`**:
   ```env
   VITE_API_URL=https://abc123.ngrok.io
   ```

**Limitations:**
- ❌ URL changes each time you restart ngrok (free tier)
- ❌ Not suitable for production
- ✅ Good for testing

---

## Option 5: Keep Using Google Cloud (With Billing Alerts)

If you're okay with enabling billing (but won't be charged):

### Set Up Billing Alerts:

1. **Enable billing** (required by Google)
2. **Set up budget alerts**:
   - Go to: https://console.cloud.google.com/billing/budgets
   - Create budget: $0.01 (1 cent)
   - Set alert at 50% ($0.005)
   - This ensures you're notified before any charges

3. **Stay within free tier**:
   - Cloud Run: 2M requests/month free
   - Cloud Storage: 5GB free
   - You'll never exceed these with normal usage

**You won't be charged** if you stay within limits!

---

## Recommendation

**For production:** Use **Render** (Option 1)
- ✅ Completely free
- ✅ No billing required
- ✅ Easy setup
- ✅ Automatic HTTPS
- ✅ Reliable

**For testing:** Use **ngrok** (Option 4)
- ✅ Instant setup
- ✅ Good for development

---

## Quick Deploy to Render

1. Go to: https://render.com
2. Sign up (free)
3. New → Web Service
4. Connect GitHub repo
5. Settings:
   - **Name**: `county-cad-api`
   - **Root Directory**: `functions`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
6. **Environment Variables**:
   ```
   GCP_PROJECT_ID=your-project-id
   GCS_BUCKET=county-cad-tracker-files
   PORT=10000
   ```
7. **Deploy!**
8. Copy the URL (e.g., `https://county-cad-api.onrender.com`)
9. Update `.env.production`:
   ```env
   VITE_API_URL=https://county-cad-api.onrender.com
   ```
10. Commit and push to GitHub

Done! Your backend is now live for free! 🎉

---

## Comparison

| Service | Free Tier | Billing Required? | Best For |
|---------|-----------|-------------------|----------|
| **Render** | 750 hrs/month | ❌ No | Production |
| **Railway** | $5/month credit | ❌ No | Production |
| **Fly.io** | 3 VMs free | ❌ No | Production |
| **Google Cloud Run** | 2M requests/month | ⚠️ Yes (but free) | Production (if OK with billing) |
| **ngrok** | Dynamic URL | ❌ No | Testing only |

Choose the one that works best for you!

