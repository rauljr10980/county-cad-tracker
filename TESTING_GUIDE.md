# Testing Guide - County CAD Tracker

## ✅ Setup Complete!

Your backend and frontend are now running locally.

## 🚀 Current Status

- **Backend API**: `http://localhost:8080`
- **Frontend**: Check terminal output (usually `http://localhost:5173`)
- **Storage Bucket**: `rbmcounty-cad-tracker-files` ✅
- **Service Account**: Configured and working ✅

## 📝 How to Test

### Step 1: Open Frontend
1. Look at the terminal where you ran `npm run dev`
2. Find the URL (usually `http://localhost:5173`)
3. Open it in your browser

### Step 2: Test File Upload
1. Click on the **Upload** tab or button
2. Select a test Excel file (.xlsx or .xls)
3. Click **Upload**
4. Watch for success message

### Step 3: Check Results
1. Go to **Files** tab to see uploaded files
2. Go to **Dashboard** to see statistics
3. Go to **Properties** to see extracted data
4. Go to **Comparison** to see changes (after 2+ uploads)

## 🔍 What to Expect

### First Upload
- File appears in **Files** tab
- Status shows "processing" then "completed"
- **Dashboard** shows property counts
- **Properties** tab shows extracted data

### Second Upload (for comparison)
- **Comparison** tab becomes available
- Shows new/removed/changed properties
- Status transitions tracked

## 🐛 Troubleshooting

### Frontend can't connect to backend
- Make sure backend is running: `cd functions && npm start`
- Check `.env` has: `VITE_API_URL=http://localhost:8080`
- Restart frontend after changing `.env`

### Upload fails
- Check backend terminal for error messages
- Verify file is Excel format (.xlsx, .xls)
- Check browser console (F12) for errors

### No data showing
- Wait a few seconds for processing
- Refresh the page
- Check backend terminal for processing logs

## 📊 API Endpoints

All endpoints are working:
- `GET /api/files` - List uploaded files
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/comparisons/:fileId` - Get comparison report
- `GET /api/comparisons/latest` - Latest comparison
- `POST /api/upload` - Upload file

## 🎯 Next Steps

Once local testing works:
1. Test with real county CAD data
2. Verify all features work correctly
3. When ready, deploy to Google Cloud (see `DEPLOY_GOOGLE_CLOUD.md`)

## 💡 Tips

- Keep both terminals open (backend + frontend)
- Check browser console (F12) for frontend errors
- Check backend terminal for API logs
- Files are stored in Google Cloud Storage bucket

