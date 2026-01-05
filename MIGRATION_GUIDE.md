# Data Migration Guide - GCS to Railway PostgreSQL

## Overview

You need to migrate your property data from Google Cloud Storage to Railway's PostgreSQL database.

## Option 1: Upload via Frontend (Recommended - Easiest)

Since we already have an upload endpoint, just use the frontend!

### Steps:

1. **Download your Excel file from Google Cloud Storage:**
   - Go to https://console.cloud.google.com/storage
   - Navigate to your bucket: `county-cad-tracker-files`
   - Find your latest Excel file (probably named like "finishedscraperdata.xlsx" or similar)
   - Click the file → Download

2. **Create an admin user on Railway:**
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

   **Save the token from the response!**

3. **Upload the Excel file:**

   **Option A - Via Frontend UI:**
   - Go to https://rauljr10980.github.io/county-cad-tracker
   - Login with your admin credentials
   - Click "Select File" and choose your downloaded Excel file
   - Click Upload
   - Wait for it to process (may take a few minutes for large files)

   **Option B - Via Command Line:**
   ```bash
   curl -X POST \
     https://county-cad-tracker-production.up.railway.app/api/upload/excel \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -F "file=@path/to/your-file.xlsx"
   ```

4. **Verify the data:**
   - Refresh your website
   - Properties should now appear!

---

## Option 2: Direct Migration Script (Advanced)

If you want to migrate directly from GCS to Railway PostgreSQL:

### Prerequisites:
- GCS credentials (service account JSON)
- Railway DATABASE_URL

### Steps:

1. **Get Railway DATABASE_URL:**
   - Go to Railway Dashboard
   - Click on PostgreSQL service
   - Go to "Variables" tab
   - Copy the `DATABASE_URL` value

2. **Set up environment variables:**
   ```bash
   export DATABASE_URL="postgresql://postgres:..."
   export GOOGLE_APPLICATION_CREDENTIALS_JSON='{...your service account JSON...}'
   export GCS_BUCKET="county-cad-tracker-files"
   ```

3. **Run migration script:**
   ```bash
   cd functions
   node migrate-data.js --source gcs
   ```

   Or to specify a specific file:
   ```bash
   node migrate-data.js --source gcs --bucket county-cad-tracker-files --file finishedscraperdata.xlsx
   ```

---

## Option 3: Use Local Excel File

If you already have the Excel file locally:

1. **Get Railway DATABASE_URL** (same as Option 2, step 1)

2. **Update functions/.env:**
   ```
   DATABASE_URL="your-railway-database-url-here"
   ```

3. **Run migration:**
   ```bash
   cd functions
   node migrate-data.js --source local --file "../TRAINED DTR_Summary.959740.xlsx"
   ```

---

## Troubleshooting

### "No file uploaded" error
- Make sure you're logged in
- Check that your token is valid
- Verify file size is under 100MB

### "Authentication required" error
- You need to create a user first (see Option 1, step 2)
- Include the token in Authorization header

### Migration script fails
- Verify DATABASE_URL is correct
- Check that the Excel file exists
- Ensure file has the correct column names

### Properties still not showing
- Check Railway Deploy logs for errors
- Verify upload completed successfully
- Check browser console for API errors

---

## Column Name Mapping

The upload endpoint looks for these column names (case-insensitive):

| Database Field | Excel Columns (any of these) |
|----------------|------------------------------|
| Account Number | "Account Number", "ACCOUNT NUMBER", "accountNumber" |
| Owner Name | "Owner Name", "OWNER NAME", "ownerName" |
| Property Address | "Property Address", "PROPERTY ADDRESS", "propertyAddress" |
| Mailing Address | "Mailing Address", "MAILING ADDRESS", "mailingAddress" |
| Total Due | "Total Due", "TOTAL DUE", "totalDue" |
| Percentage Due | "Percentage Due", "PERCENTAGE DUE", "percentageDue" |
| Status | "Status", "STATUS", "status" |
| Tax Year | "Tax Year", "TAX YEAR", "taxYear" |
| Legal Description | "Legal Description", "LEGAL DESCRIPTION", "legalDescription" |

Make sure your Excel file has at least "Account Number" and "Owner Name" columns.

---

## Expected Results

After successful upload, you should see:
```json
{
  "success": true,
  "message": "File uploaded and processed successfully",
  "stats": {
    "totalRows": 33000,
    "inserted": 32500,
    "updated": 500,
    "skipped": 0,
    "errors": 0
  }
}
```

The properties will then appear in your frontend immediately!

---

## Recommended Approach

**Use Option 1** (Upload via Frontend) - It's the simplest and already tested!

1. Download Excel from GCS
2. Create admin user
3. Upload via frontend UI
4. Done! ✅
