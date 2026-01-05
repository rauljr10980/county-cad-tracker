# Railway Deployment Fix

The wheelhouse error happens because Railway can't find the right directory structure.

## Option 1: Set Root Directory (EASIEST)

1. Go to Railway → Your Service
2. Click **Settings**
3. Scroll to **Root Directory**
4. Set it to: `functions`
5. Click **Save**
6. Go to **Deploy** section
7. Set **Start Command** to: `npx prisma migrate deploy && node src/index.js`
8. Click **Redeploy**

This tells Railway to build from the functions/ folder.

## Option 2: Manual Deploy via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Set root directory
railway up --service your-service-name --root functions
```

## Option 3: If Options 1 & 2 fail

In Railway Dashboard:
1. Delete the current service
2. Create NEW service
3. Select "Empty Service"
4. Connect GitHub repo
5. In Settings:
   - Root Directory: `functions`
   - Build Command: `npm install && npx prisma generate`
   - Start Command: `npx prisma migrate deploy && node src/index.js`
6. Add PostgreSQL database
7. Set environment variables

## Common Issues

### "Failed to leave the wheelhouse"
- Means build process failed
- Usually wrong directory structure
- Fix: Set Root Directory to `functions`

### "Cannot find module"
- Prisma not in dependencies
- Already fixed in latest commit

### Database connection fails
- DATABASE_URL not set
- Add PostgreSQL service in Railway
- It auto-sets the variable

## Check Logs

Always check Railway logs:
- Deployments tab → Click latest deployment → View logs
- Look for actual error message
