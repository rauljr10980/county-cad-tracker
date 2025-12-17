# How to Verify File Uploads

This guide shows you multiple ways to verify that files have been uploaded successfully.

## Method 1: Check the Files Tab in the UI

1. Navigate to the **Files** tab in the application
2. You should see all uploaded files listed with their status:
   - ✅ **Completed** - File processed successfully
   - ⏳ **Processing** - File is being processed
   - ❌ **Error** - File processing failed

## Method 2: Check Browser Developer Tools

### Network Tab
1. Open browser DevTools (F12)
2. Go to the **Network** tab
3. Upload a file
4. Look for the `/api/upload` request - it should return `200 OK` with:
   ```json
   {
     "success": true,
     "fileId": "1234567890",
     "message": "File uploaded successfully"
   }
   ```
5. Check the `/api/files` request - it should list all files including the new one

### Console Tab
- Check for any error messages
- Look for upload success messages

## Method 3: Check Backend Console Logs

When you upload a file, the backend should log:
```
[UPLOAD] File uploaded successfully: {
  fileId: '...',
  filename: '...',
  storagePath: 'uploads/...',
  size: ...,
  uploadedAt: '...'
}
[PROCESS] Starting processing for fileId: ...
[PROCESS] Downloaded file, size: ... bytes
[PROCESS] Parsing Excel file
[PROCESS] Parsed ... rows from file
[PROCESS] Extracted ... properties
[PROCESS] Updated file metadata with status: completed
[PROCESS] Successfully processed ... properties from ...
```

## Method 4: Test GCS Connection (IMPORTANT!)

**First, verify your Google Cloud Storage connection is working:**

### In Browser
Open: `http://localhost:8080/api/debug/test-connection`

### Using PowerShell
```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/debug/test-connection" | ConvertTo-Json -Depth 10
```

This will show:
- ✅ Whether credentials are configured
- ✅ Whether the bucket exists
- ✅ Whether you have read/write permissions
- ❌ Any connection errors

**If this fails, your uploads won't work!** Fix the connection issues first.

## Method 5: Use the Debug Verification Endpoint

I've added a debug endpoint you can call directly:

### In Browser
Open: `http://localhost:8080/api/debug/verify`

### Using curl
```bash
curl http://localhost:8080/api/debug/verify
```

### Using PowerShell
```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/debug/verify" | ConvertTo-Json -Depth 10
```

This will return:
```json
{
  "bucket": "county-cad-tracker-files",
  "metadataFilesCount": 3,
  "uploadedFilesCount": 3,
  "files": [
    {
      "id": "...",
      "filename": "...",
      "uploadedAt": "...",
      "status": "completed",
      "propertyCount": 58432,
      "fileExists": true,
      "fileSize": 1234567,
      "fileCreated": "..."
    }
  ],
  "summary": {
    "total": 3,
    "completed": 2,
    "processing": 1,
    "error": 0,
    "missingFiles": 0
  }
}
```

## Method 6: Test the API Directly

### Get all files
```bash
curl http://localhost:8080/api/files
```

Or in PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/files" | ConvertTo-Json -Depth 10
```

## Method 7: Check Google Cloud Storage (if using GCS)

If you're using Google Cloud Storage, you can check:

1. **Storage Location**: Files are stored at:
   - Actual files: `uploads/{fileId}_{filename}`
   - Metadata: `metadata/files/{fileId}.json`
   - Properties: `data/properties/{fileId}.json`

2. **Using gcloud CLI**:
   ```bash
   gsutil ls gs://county-cad-tracker-files/uploads/
   gsutil ls gs://county-cad-tracker-files/metadata/files/
   ```

3. **Using Google Cloud Console**:
   - Go to Cloud Storage in Google Cloud Console
   - Navigate to your bucket
   - Check the `uploads/` and `metadata/files/` folders

## Common Issues

### File shows "Processing" but never completes
- Check backend logs for processing errors
- Verify the file format is correct (Excel .xlsx or PDF)
- Check if the file is too large or corrupted

### File doesn't appear in the list
- Verify the API endpoint is correct (should be `/api/files`)
- Check browser console for API errors
- Verify backend server is running on port 8080
- Check CORS settings if calling from different origin

### Upload succeeds but file is missing
- **FIRST**: Run `/api/debug/test-connection` to verify GCS access
- Check the debug endpoint to see if file exists in storage
- Verify Google Cloud Storage credentials are configured:
  - Check `functions/.env` exists with `GOOGLE_APPLICATION_CREDENTIALS`
  - Verify `service-account-key.json` exists in `functions/` directory
  - Ensure the service account has **Storage Admin** role
- Check backend logs for storage errors (now with detailed logging)
- Verify the bucket name matches: `county-cad-tracker-files` (or your custom bucket)

## Quick Verification Checklist

- [ ] Backend server is running (check console for "Server running on http://localhost:8080")
- [ ] Upload request returns 200 OK
- [ ] File appears in Files tab within 5 seconds (auto-refresh)
- [ ] Backend logs show upload and processing messages
- [ ] Debug endpoint shows the file in the list
- [ ] File status changes from "processing" to "completed"

