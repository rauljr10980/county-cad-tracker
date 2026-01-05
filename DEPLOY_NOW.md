# 🚀 Deploy to Railway NOW - Quick Start Guide

Your code is ready to deploy! Follow these steps:

## Step 1: Go to Railway
https://railway.app → Login with GitHub

## Step 2: New Project
- Click "New Project"
- Select "Deploy from GitHub repo"
- Choose "rauljr10980/county-cad-tracker"

## Step 3: Add PostgreSQL
- Click "New" → "Database" → "PostgreSQL"
- Railway auto-sets DATABASE_URL

## Step 4: Set Environment Variables
In your service → Variables:
```
JWT_SECRET=c4f3e2d1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1
NODE_ENV=production
PORT=8080
ALLOWED_ORIGINS=https://rauljr10980.github.io
```

## Step 5: Configure Build
Settings → Build Command:
```
cd functions && npm install && npm run build
```

Settings → Start Command:
```
cd functions && npm run prisma:migrate && npm start
```

## Step 6: Generate Domain
Settings → Networking → Generate Domain

## Step 7: Test
```bash
curl https://your-service.railway.app/health
```

## Step 8: Create Admin User
```bash
curl -X POST https://your-service.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"raul","email":"raul@example.com","password":"YourPassword123!"}'
```

Full guide: README_RAILWAY_DEPLOY.md
