# Deploy Backend - Final Steps

## ✅ What's Done

- ✅ Service account created with Storage Admin
- ✅ Storage bucket created: `county-cad-tracker-files`
- ✅ Config file created: `functions/.env`
- ✅ Project ID updated: `tax-delinquent-software`

## 🚀 Deploy Now

### Step 1: Login to Firebase

Open a terminal and run:

```bash
firebase login
```

This will open a browser for you to authenticate.

### Step 2: Initialize Firebase (if needed)

```bash
cd functions
firebase init functions
```

- Select: Use existing project
- Choose: `tax-delinquent-software`
- Language: JavaScript
- ESLint: No (or Yes, your choice)

### Step 3: Deploy Backend

```bash
firebase deploy --only functions
```

**You'll get a URL like:**
```
https://us-central1-tax-delinquent-software.cloudfunctions.net/api
```

**Copy this URL!** You'll need it in the next step.

### Step 4: Update Production API URL

**Create `.env.production` in project root:**

```env
VITE_API_URL=https://us-central1-tax-delinquent-software.cloudfunctions.net/api
```

(Replace with the actual URL from step 3)

### Step 5: Rebuild and Push

```bash
npm run build
git add .
git commit -m "Deploy backend and add production API URL"
git push
```

## 🎉 Done!

Your live site will now be able to upload files!

**Test it:** https://rauljr10980.github.io/county-cad-tracker/

## Quick Commands

```bash
# 1. Login
firebase login

# 2. Deploy
cd functions
firebase deploy --only functions

# 3. Create .env.production with the function URL

# 4. Rebuild
cd ..
npm run build

# 5. Push
git add .
git commit -m "Deploy backend"
git push
```

