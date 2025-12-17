# Railway Build Fix - Dependencies Not Installing

The error "Cannot find module '@google-cloud/storage'" means **dependencies aren't being installed**.

## The Problem

Railway is not running `npm install` during the build phase.

## Solution: Check Railway Settings

Go to Railway Dashboard → Your Service → **Settings** tab:

### 1. Root Directory
- Should be: `functions`
- ✅ Verify this is set correctly

### 2. Build Command
- **Clear this field** (leave empty)
- OR set to: `npm install`
- Railway should auto-detect from `nixpacks.toml`, but if it's not working, set it manually

### 3. Start Command  
- **Clear this field** (leave empty)
- OR set to: `node index.js`
- Railway should auto-detect from `nixpacks.toml`

### 4. Nixpacks Config File
- Railway should find: `functions/nixpacks.toml`
- If not working, try moving it to root or check Railway logs

## Alternative: Manual Build Command

If nixpacks isn't working, set these manually in Railway Settings:

**Build Command:**
```bash
npm install
```

**Start Command:**
```bash
node index.js
```

## Check Build Logs

1. Go to Railway Dashboard → Your Service
2. Click **Deployments** tab
3. Click on the latest deployment
4. Click **Build Logs** tab
5. Look for:
   - ✅ "Starting npm install..."
   - ✅ "Dependencies installed successfully"
   - ✅ List of node_modules

If you DON'T see these messages, Railway isn't running the install command.

## Quick Fix Steps

1. **Go to Railway Settings**
2. **Set Build Command to:** `npm install`
3. **Set Start Command to:** `node index.js`
4. **Save** (Railway will redeploy)
5. **Check Build Logs** - you should see npm installing packages

## Why This Happens

Railway's auto-detection might not be finding the `nixpacks.toml` file, or the install phase isn't running. Setting the commands manually forces Railway to run them.

Try setting the Build and Start commands manually in Railway Settings!

