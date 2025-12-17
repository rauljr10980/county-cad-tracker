# Google Cloud Setup Guide

This guide will help you set up Google Cloud Platform (GCP) for the County CAD Tracker application.

## Prerequisites

1. **Google Cloud Account**: Sign up at [cloud.google.com](https://cloud.google.com)
2. **Node.js**: Version 18 or higher
3. **Firebase CLI**: Install globally with `npm install -g firebase-tools`
4. **Google Cloud SDK**: Install from [cloud.google.com/sdk](https://cloud.google.com/sdk)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Create Project"
3. Enter project name: `county-cad-tracker` (or your preferred name)
4. Note your **Project ID** (you'll need this later)

## Step 2: Enable Required APIs

Enable the following APIs in your project:

```bash
# Install Google Cloud SDK first, then run:
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable firestore.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

Or enable them via the [Google Cloud Console](https://console.cloud.google.com/apis/library)

## Step 3: Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add Project"
3. Select your Google Cloud project
4. Follow the setup wizard
5. Enable **Firestore Database** (start in test mode for development)
6. Enable **Storage** (start in test mode for development)

## Step 4: Configure Firebase CLI

```bash
# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init

# Select:
# - Firestore
# - Functions
# - Storage
# - Use existing project (select your project)
```

## Step 5: Update Configuration Files

1. **Update `.firebaserc`**:
   ```json
   {
     "projects": {
       "default": "your-actual-project-id"
     }
   }
   ```

2. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

3. **Update `.env`** with your project ID:
   ```
   VITE_API_URL=http://localhost:5001/your-project-id/us-central1/api
   ```

## Step 6: Create Cloud Storage Bucket

```bash
# Create a bucket for file uploads
gsutil mb -p your-project-id -l us-central1 gs://county-cad-tracker-files

# Or via console: https://console.cloud.google.com/storage
```

## Step 7: Install Backend Dependencies

```bash
cd functions
npm install
```

## Step 8: Deploy Backend Functions

```bash
# Deploy to Firebase
firebase deploy --only functions

# Or deploy specific function
firebase deploy --only functions:api
```

After deployment, note the function URL. It will look like:
```
https://us-central1-your-project-id.cloudfunctions.net/api
```

## Step 9: Update Frontend Environment

Update your `.env` file with the deployed function URL:

```env
VITE_API_URL=https://us-central1-your-project-id.cloudfunctions.net/api
```

## Step 10: Set Up Firestore Indexes

The required indexes are already defined in `firestore.indexes.json`. Deploy them:

```bash
firebase deploy --only firestore:indexes
```

## Step 11: Configure Security Rules

For production, update `firestore.rules` and `storage.rules` with proper security rules. The current rules allow all access (suitable for development only).

Deploy rules:
```bash
firebase deploy --only firestore:rules,storage:rules
```

## Local Development

### Run Functions Locally

```bash
cd functions
npm run serve
```

This starts the Firebase emulator suite. The API will be available at:
```
http://localhost:5001/your-project-id/us-central1/api
```

### Run Frontend

```bash
npm run dev
```

## Testing the Setup

1. Upload a test Excel file through the UI
2. Check Firebase Console → Firestore to see if data is being stored
3. Check Firebase Console → Storage to see if files are uploaded
4. Check Firebase Console → Functions to see function logs

## Troubleshooting

### Common Issues

1. **"Permission denied" errors**:
   - Ensure you're logged in: `firebase login`
   - Check project ID matches in `.firebaserc`

2. **"Function not found" errors**:
   - Verify function is deployed: `firebase functions:list`
   - Check function URL matches in `.env`

3. **"Bucket not found" errors**:
   - Create the bucket: `gsutil mb gs://county-cad-tracker-files`
   - Or update `GCS_BUCKET` environment variable

4. **CORS errors**:
   - Functions should handle CORS automatically
   - Check browser console for specific errors

## Production Deployment

1. **Update security rules** in `firestore.rules` and `storage.rules`
2. **Set environment variables** for production
3. **Enable billing** on your Google Cloud project
4. **Set up monitoring** in Google Cloud Console
5. **Configure backup** for Firestore data

## Cost Estimation

- **Cloud Functions**: Free tier includes 2 million invocations/month
- **Firestore**: Free tier includes 50K reads, 20K writes/day
- **Cloud Storage**: Free tier includes 5GB storage, 1GB egress/month

For typical usage (1000 files/month, 50K properties each):
- Functions: ~$0-5/month
- Firestore: ~$10-30/month
- Storage: ~$5-15/month

**Total estimated cost: $15-50/month** (after free tier)

## Next Steps

- Set up automated backups
- Configure monitoring and alerts
- Set up CI/CD pipeline
- Implement proper authentication
- Add rate limiting

## Support

For issues or questions:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Google Cloud Documentation](https://cloud.google.com/docs)
- [Cloud Functions Documentation](https://cloud.google.com/functions/docs)

