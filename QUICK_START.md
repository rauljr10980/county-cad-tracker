# Quick Start Guide

Get your County CAD Tracker up and running with Google Cloud in minutes!

## Prerequisites Checklist

- [ ] Google Cloud account
- [ ] Node.js 18+ installed
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)

## 5-Minute Setup

### 1. Create Google Cloud Project (2 min)

```bash
# Login to Firebase
firebase login

# Create/select project in Firebase Console
# Visit: https://console.firebase.google.com
```

### 2. Initialize Firebase (1 min)

```bash
# In project root
firebase init

# Select:
# ✓ Firestore
# ✓ Functions  
# ✓ Storage
# ✓ Use existing project (select yours)
```

### 3. Update Configuration (30 sec)

Edit `.firebaserc`:
```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

Create `.env`:
```bash
cp .env.example .env
# Edit .env and add your project ID
```

### 4. Install & Deploy (1 min)

```bash
# Install backend dependencies
cd functions
npm install

# Deploy functions
cd ..
firebase deploy --only functions

# Note the function URL from output
```

### 5. Update Frontend (30 sec)

Edit `.env` with your deployed function URL:
```
VITE_API_URL=https://us-central1-your-project-id.cloudfunctions.net/api
```

### 6. Run the App

```bash
# Install frontend dependencies (if not done)
npm install

# Start development server
npm run dev
```

## Testing

1. Open http://localhost:8080
2. Go to "Upload" tab
3. Upload a test Excel file (.xlsx or .xls)
4. Check "Files" tab to see processing status
5. Check "Comparison" tab after uploading 2+ files

## Local Development (Optional)

To test locally without deploying:

```bash
# Terminal 1: Start Firebase emulators
cd functions
npm run serve

# Terminal 2: Start frontend
npm run dev
```

Update `.env` for local:
```
VITE_API_URL=http://localhost:5001/your-project-id/us-central1/api
```

## Troubleshooting

**"Permission denied"**
- Run `firebase login` again

**"Function not found"**  
- Check function URL in `.env` matches deployment output
- Verify function is deployed: `firebase functions:list`

**"Bucket not found"**
- Create bucket: `gsutil mb gs://county-cad-tracker-files`
- Or update bucket name in `functions/index.js`

**CORS errors**
- Functions handle CORS automatically
- Check browser console for specific errors

## Next Steps

- Read [GOOGLE_CLOUD_SETUP.md](./GOOGLE_CLOUD_SETUP.md) for detailed configuration
- Set up production security rules
- Configure monitoring and alerts
- Set up automated backups

## Need Help?

- Check [GOOGLE_CLOUD_SETUP.md](./GOOGLE_CLOUD_SETUP.md) for detailed instructions
- Review Firebase Console logs for errors
- Check browser console for frontend errors

