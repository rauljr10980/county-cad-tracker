# Excel Data Upload to PostgreSQL

This guide explains how to upload your Excel file (`finishedscraperdata.xlsx`) to the PostgreSQL database.

## Files Created

1. **`upload_excel_to_properties_table.js`** - Main upload script that imports Excel data to PostgreSQL
2. **`test_upload_dry_run.js`** - Test script to preview data without connecting to database

## Column Mappings

The scripts map Excel columns to database columns as follows:

| Database Column | Excel Column |
|----------------|-------------|
| `accountNumber` | `NEW-Account Number` (column 60) |
| `ownerName` | `NEW-Owner Name` (column 75) |
| `propertyAddress` | `NEW-Property Site Address` (column 77) |
| `mailingAddress` | `NEW-Owner Address` (column 74) |
| `totalDue` | `NEW-Total Amount Due` (column 79) |

## Prerequisites

1. **DATABASE_URL** must be set in your `.env` file
   - Get it from: Railway → PostgreSQL service → Variables → DATABASE_URL
   - Format: `postgresql://user:password@host:port/database`

2. **Excel file** (`finishedscraperdata.xlsx`) must be accessible
   - 33,918 rows of property data
   - 82 columns (original data + scraped "NEW-" columns)

3. **Node.js dependencies** installed:
   ```bash
   cd functions
   npm install
   ```

## Step 1: Test (Dry Run)

Before uploading, preview what will be uploaded:

```bash
cd functions
node test_upload_dry_run.js "path/to/finishedscraperdata.xlsx"
```

This will:
- ✅ Read the Excel file
- ✅ Show all column names
- ✅ Show column mappings
- ✅ Display sample properties (first 5)
- ✅ Show statistics (total rows, success rate, etc.)
- ❌ **Does NOT connect to database**

**Expected Output:**
- Column mappings for all required fields
- Sample properties with correct data
- Statistics showing how many properties will be uploaded

## Step 2: Upload to Database

Once the dry run looks correct, upload the data:

```bash
cd functions
node upload_excel_to_properties_table.js "path/to/finishedscraperdata.xlsx"
```

This will:
- ✅ Connect to PostgreSQL database
- ✅ Read the Excel file
- ✅ Extract properties using column mappings
- ✅ Insert new records or update existing ones (based on `accountNumber`)
- ✅ Show progress and final statistics

**Expected Output:**
- Connection confirmation
- Progress updates (every 100 records)
- Final summary:
  - Total properties processed
  - Inserted (new records)
  - Updated (existing records)
  - Skipped (errors)

## Troubleshooting

### Error: DATABASE_URL is not set
**Solution:** Add `DATABASE_URL` to your `.env` file in the `functions` directory.

### Error: Column not found
**Solution:** The script tries multiple variations of column names. Check the dry run output to see which columns were found. If a column is missing, verify the Excel file has the expected column names.

### Error: Table "properties" does not exist
**Solution:** Run Prisma migrations to create the table:
```bash
cd functions
npx prisma db push
```

### No properties extracted
**Solution:** 
1. Run the dry run script to see column mappings
2. Verify the Excel file has the expected column names
3. Check that the header row is in row 1 or row 3 (script checks both)

## Database Schema

The script inserts data into the `properties` table with these fields:
- `accountNumber` (unique, primary key)
- `ownerName`
- `propertyAddress`
- `mailingAddress`
- `totalDue`
- `percentageDue`
- `status` (ACTIVE, PENDING, JUDGMENT, PAID, REMOVED)
- `createdAt`
- `updatedAt`

## Notes

- **Upsert behavior:** If a property with the same `accountNumber` exists, it will be updated. Otherwise, a new record is inserted.
- **Batch processing:** Records are processed in batches of 100 for performance.
- **Error handling:** Individual record errors are logged but don't stop the upload process.
- **Status mapping:** The script maps `LEGALSTATUS` column values:
  - 'P' → PENDING
  - 'J' → JUDGMENT
  - 'A' → ACTIVE
  - Default → ACTIVE

## Next Steps

After successful upload:
1. Verify data in database:
   ```bash
   cd functions
   npx prisma studio
   ```
2. Check the Properties tab in your application
3. Verify all 33,918 records are present


