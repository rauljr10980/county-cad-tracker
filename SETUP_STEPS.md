# Step-by-Step Setup Guide

Follow these steps in order:

## Step 1: Get Your Service Account Key (5 minutes)

1. **Go to Google Cloud Console**: https://console.cloud.google.com/iam-admin/serviceaccounts

2. **Click "Create Service Account"**

3. **Fill in details**:
   - Service account name: `county-cad-tracker`
   - Click "Create and Continue"

4. **Grant role**:
   - Select: **Storage Admin**
   - Click "Continue" then "Done"

5. **Create key**:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose **JSON**
   - Click "Create" (file will download)

6. **Save the file**:
   - Rename it to: `service-account-key.json`
   - Move it to: `functions/service-account-key.json`

## Step 2: Create Storage Bucket (2 minutes)

1. **Go to**: https://console.cloud.google.com/storage

2. **Click "Create Bucket"**

3. **Fill in**:
   - Name: `county-cad-tracker-files`
   - Location type: **Region**
   - Location: `us-central1` (or your preferred region)
   - Click "Create"

## Step 3: Get Your Project ID (1 minute)

1. **Go to**: https://console.cloud.google.com
2. **Look at the top** - your Project ID is shown there
3. **Copy it** - you'll need it in the next step

## Step 4: Create Configuration File (1 minute)

1. **Create file**: `functions/.env`

2. **Add this content** (replace `your-project-id` with your actual Project ID):
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
   GCP_PROJECT_ID=your-project-id
   GCS_BUCKET=county-cad-tracker-files
   ```

## Step 5: Install Dependencies (2 minutes)

Open terminal in your project folder and run:

```bash
cd functions
npm install
```

## Step 6: Test It! (1 minute)

```bash
npm run serve
```

You should see:
```
✔  functions[api]: http function initialized
```

## Step 7: Update Frontend Config

Create `.env` file in project root:

```env
VITE_API_URL=http://localhost:5001/your-project-id/us-central1/api
```

Replace `your-project-id` with your actual Project ID.

## Step 8: Run Frontend

In a new terminal:

```bash
npm run dev
```

## Step 9: Test Upload

1. Open: http://localhost:8080
2. Go to "Upload" tab
3. Upload a test Excel file
4. Check "Files" tab to see it processing

## Troubleshooting

**"Cannot find module"**
- Run `cd functions && npm install`

**"Permission denied"**
- Check service account has "Storage Admin" role
- Verify JSON file path is correct

**"Bucket not found"**
- Create the bucket first (Step 2)
- Check bucket name matches in `.env`

**"Project ID not found"**
- Get your Project ID from Google Cloud Console
- Update `GCP_PROJECT_ID` in `functions/.env`

## You're Done! 🎉

Your app is now using Google Cloud Storage to:
- Upload Excel files
- Process and extract properties
- Store comparisons
- Track file history

All without needing a database!

