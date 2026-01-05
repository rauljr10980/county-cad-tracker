# Railway Deployment Verification Checklist

## Latest Changes Summary (Last 4 Commits)

### Commit a0517f3: Add Excel Upload Endpoint ✅
**What it does:** Adds the missing file upload functionality so you can populate the PostgreSQL database.

**Changes:**
- Created `/api/upload/excel` endpoint
- Accepts Excel files (.xlsx, .xls) up to 100MB
- Upsert logic (insert new properties, update existing ones)
- Returns upload statistics (inserted/updated/skipped counts)
- Added `multer` dependency for file handling

**Why needed:** The database was empty because we migrated to PostgreSQL but forgot to add upload functionality.

---

### Commit 6a7601b: Improve CORS Configuration ✅
**What it does:** Better error handling and logging for cross-origin requests.

**Changes:**
- Explicit CORS methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
- Explicit allowed headers: Content-Type, Authorization
- Logs blocked origins for debugging
- Better origin matching logic

**Why needed:** Fix the CORS errors you saw in browser console when GitHub Pages tried to access Railway API.

---

### Commit 2defeaf: Fix Dockerfile Path Issue ✅
**What it does:** Fixed the "Cannot find module '/app/functions/index.js'" error.

**Changes:**
- Corrected COPY commands in Dockerfile
- Proper file structure after build
- Better layer caching with separate package.json copy

**Why needed:** Railway was looking for `/app/functions/index.js` but the actual path was `/app/src/index.js`.

---

### Commit 631e748 & Earlier: Database Schema & Connection Fixes ✅
**What it does:** Fixed empty migrations and database connection issues.

**Changes:**
- Replaced `prisma migrate deploy` with `prisma db push`
- Added database connection test before server start
- Server binds to `0.0.0.0` instead of `localhost`
- Proper Prisma disconnect on shutdown

---

## Verification Steps

### 1. Check Railway Build Logs

In Railway Dashboard → Your Service → **Build** tab:

**✅ Look for these success messages:**
```
Step 1/8 : FROM node:18-slim
...
Step 4/8 : COPY functions/package*.json ./
Step 5/8 : RUN npm install
added 231 packages
Step 6/8 : COPY functions/ ./
Step 7/8 : RUN npx prisma generate
✔ Generated Prisma Client
Step 8/8 : CMD npx prisma db push --accept-data-loss && node src/index.js
Successfully built [image-id]
```

**❌ Red flags to watch for:**
- "Cannot find module" errors
- npm install failures
- Prisma generate failures
- Build timeout

---

### 2. Check Railway Deploy Logs

In Railway Dashboard → Your Service → **Deploy** tab:

**✅ Look for these success messages:**
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database

🔌 Testing database connection...
✅ Database connected successfully

╔═══════════════════════════════════════════════════════════╗
║   County CAD Tracker API v3.0                             ║
║   PostgreSQL + Prisma + Express                           ║
╠═══════════════════════════════════════════════════════════╣
║   Server: http://0.0.0.0:8080                             ║
║   Environment: production                                 ║
║   Database: PostgreSQL (Prisma) - Connected               ║
╚═══════════════════════════════════════════════════════════╝
```

**❌ Red flags to watch for:**
- "❌ Failed to start server"
- "Database URL exists: false"
- Connection timeout errors
- Crash loop (restarts repeatedly)

---

### 3. Verify PostgreSQL Database Tables

In Railway Dashboard → **PostgreSQL** service (elephant icon) → **Data** tab:

**✅ You should see these tables:**
```
Tables:
├── users
├── properties
├── tasks
├── task_activities
├── notes
├── payment_history
├── file_uploads
└── _prisma_migrations
```

**If tables are missing:**
- Check Deploy logs for "prisma db push" output
- Look for error messages during schema sync
- Verify DATABASE_URL environment variable is set

---

### 4. Test API Endpoints

#### A. Health Check
```bash
curl https://county-cad-tracker-production.up.railway.app/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T..."
}
```

#### B. API Info
```bash
curl https://county-cad-tracker-production.up.railway.app/
```

**Expected response:**
```json
{
  "name": "County CAD Tracker API",
  "version": "3.0.0",
  "status": "running",
  "database": "PostgreSQL",
  "features": [
    "Property Management",
    "Task Delegation & Tracking",
    "Property Notes",
    "Full Audit Trail",
    "Multi-user Support"
  ]
}
```

#### C. Properties Endpoint (Should be empty until you upload)
```bash
curl https://county-cad-tracker-production.up.railway.app/api/properties
```

**Expected response (empty database):**
```json
{
  "properties": [],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 0,
    "totalPages": 0
  }
}
```

---

### 5. Check Frontend Connection

Open your GitHub Pages site: `https://rauljr10980.github.io/county-cad-tracker`

**In Browser DevTools Console:**

**✅ Good signs:**
```
[API] Using API URL: https://county-cad-tracker-production.up.railway.app
```

**❌ Bad signs:**
```
Failed to load resource: net::ERR_FAILED
Access to fetch... has been blocked by CORS policy
502 Bad Gateway
```

**In Network Tab:**
- Look for requests to `county-cad-tracker-production.up.railway.app`
- Check response status codes (200 = good, 502/504 = bad)
- Verify CORS headers are present in responses

---

### 6. Environment Variables Check

In Railway Dashboard → Your Service → **Variables** tab:

**✅ Required variables:**
```
DATABASE_URL          (auto-set by PostgreSQL plugin)
PORT                  (auto-set by Railway, usually 8080)
NODE_ENV              production
```

**⚠️ Optional but recommended:**
```
ALLOWED_ORIGINS       https://rauljr10980.github.io
JWT_SECRET            (random secure string)
```

---

## What to Do If Things Fail

### If Build Fails
1. Check package.json dependencies are correct
2. Verify Dockerfile syntax
3. Check if package-lock.json conflicts exist
4. Try: Settings → Redeploy → Clear Cache + Redeploy

### If Deploy Crashes
1. Check DATABASE_URL is set
2. Verify PostgreSQL service is running
3. Check Deploy logs for specific error messages
4. Verify schema.prisma matches what Prisma expects

### If CORS Errors
1. Verify `ALLOWED_ORIGINS` includes your GitHub Pages URL
2. Check if server is actually responding (use curl)
3. Look for "CORS blocked origin:" messages in Deploy logs

### If Database is Empty
1. This is EXPECTED! You need to upload your Excel file
2. Use the upload UI on your frontend
3. Or use curl to test upload endpoint (see below)

---

## How to Upload Your Data

### Option 1: Frontend Upload (Recommended)
1. Go to your website: `https://rauljr10980.github.io/county-cad-tracker`
2. You should see "Select File" button
3. Choose your Excel file
4. Click Upload
5. Properties should appear

### Option 2: Command Line Upload (Testing)
```bash
curl -X POST \
  https://county-cad-tracker-production.up.railway.app/api/upload/excel \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@/path/to/your/properties.xlsx"
```

**Note:** You need to create a user first and get a JWT token.

---

## Creating Your First Admin User

```bash
curl -X POST \
  https://county-cad-tracker-production.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "your-email@example.com",
    "password": "YourSecurePassword123!",
    "role": "ADMIN"
  }'
```

**Save the returned token** - you'll need it for uploads!

---

## Current Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Frontend (GitHub Pages)                                     │
│  └─ https://rauljr10980.github.io/county-cad-tracker        │
│                           ↓                                   │
│  Backend API (Railway)                                       │
│  └─ https://county-cad-tracker-production.up.railway.app    │
│                           ↓                                   │
│  PostgreSQL Database (Railway)                               │
│  ├─ Properties (EMPTY - needs data upload)                   │
│  ├─ Tasks                                                     │
│  ├─ Notes                                                     │
│  ├─ Users                                                     │
│  └─ Activity logs                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps After Verification

1. ✅ Verify Railway deployment is running (check logs)
2. ✅ Verify database tables exist
3. ✅ Test API endpoints with curl
4. ✅ Check frontend can connect to backend
5. ⏳ Create admin user
6. ⏳ Upload Excel file with property data
7. ⏳ Verify properties appear in frontend
8. ⏳ Test task delegation features
9. ⏳ Test property notes
10. ✅ Celebrate! 🎉

---

## Common Issues & Solutions

### "Loading Properties..." Forever
**Cause:** Database is empty
**Solution:** Upload your Excel file using the frontend UI

### 502 Bad Gateway
**Cause:** Server crashed or not responding
**Solution:** Check Deploy logs for error messages

### CORS Errors in Console
**Cause:** Server not allowing GitHub Pages origin
**Solution:** Already fixed in commit 6a7601b, should work now

### Cannot Find Module Errors
**Cause:** Dockerfile path issues
**Solution:** Already fixed in commit 2defeaf, should work now

---

## Support

If you encounter issues not covered here:
1. Check Railway Deploy logs first
2. Check browser DevTools console
3. Try redeploying from Railway dashboard
4. Verify all environment variables are set

---

**Last Updated:** January 5, 2026
**Latest Commit:** a0517f3 (Add Excel file upload endpoint)
