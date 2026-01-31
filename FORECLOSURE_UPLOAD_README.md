# Foreclosure Upload Feature

## Overview
A new upload system has been created specifically for foreclosure data with support for the exact format shown in your Excel file.

## Files Created

### Frontend Components
1. **`src/components/foreclosure/ForeclosureUpload.tsx`**
   - Upload modal with drag-and-drop support
   - Two upload modes: Standard and Address-Only
   - File validation (.xlsx, .xls, .csv, max 100MB)
   - Progress tracking and error handling
   - Success/failure notifications

2. **`src/components/foreclosure/ForeclosureView.tsx`**
   - Full page view for managing foreclosures
   - Table display of all foreclosure records
   - Export to CSV functionality
   - Active/Inactive filter toggle
   - Integration with upload button

### Hooks
3. **`src/hooks/useForeclosure.ts`**
   - React Query mutation for file uploads
   - Automatic cache invalidation after upload

### API Layer
4. **`src/lib/api.ts`** (updated)
   - New `uploadForeclosureFile()` function
   - Converts file to Base64 for upload
   - Sends to `/api/foreclosure/upload` endpoint
   - Returns processing statistics

### Backend Routes
5. **`functions/src/routes/foreclosure.js`**
   - **POST /api/foreclosure/upload** - Upload and process foreclosure files
   - **GET /api/foreclosure** - Fetch all foreclosure records (with active filter)
   - **DELETE /api/foreclosure** - Delete all foreclosure records

### Database Schema
6. **`functions/prisma/schema.prisma`** (updated)
   - New `Foreclosure` model with all required fields
   - Proper indexing on docNumber, saleDate, active, fileId

### Server Configuration
7. **`functions/src/index.js`** (updated)
   - Registered `/api/foreclosure` route

---

## Excel File Format Support

The upload system intelligently maps these columns from your Excel file:

### Required Fields
- **Doc Number / Document Number** → `docNumber` (required)
- **Type** → `type` (Mortgage or Tax)
- **Address fields** → Supports both formats:
  - **Full Address** → Automatically splits into street, city, state, zip
  - **Separate columns** → Street Address, City, State, Zip Code

### Optional Fields
- **Recorded Date / RecordedDate** → `recordedDate`
- **Sale Date / SaleDate** → `saleDate`
- **Remarks** → `remarks`
- **Filing Month** → `filingMonth` (defaults to current month if not provided)

---

## Upload Modes

### 1. Standard Upload
- Processes all columns including Type, dates, and full property information
- Best for complete foreclosure datasets

### 2. Address-Only Upload
- Focuses on extracting property addresses
- Type defaults to null (can be set manually)
- Faster processing for address-focused data

---

## How It Works

### Upload Process
```
1. User selects Excel file (.xlsx, .xls, or .csv)
2. Frontend validates file (type, size)
3. File converted to Base64 and sent to backend
4. Backend parses file with intelligent column mapping
5. Records inserted in batches of 100
6. Old records (not in upload) marked as inactive
7. New records marked as active
8. Returns statistics (total, active, inactive)
```

### Data Matching
- Records are matched by **Document Number**
- If a document number exists from a previous upload but is missing in the new upload, it's marked **inactive**
- Records in the new upload are always marked **active**

---

## Usage Example

### Add to Your App
```tsx
import { ForeclosureView } from './components/foreclosure/ForeclosureView';

// In your router/navigation
<Route path="/foreclosures" element={<ForeclosureView />} />
```

### Or Use Just the Upload Button
```tsx
import { ForeclosureUpload } from './components/foreclosure/ForeclosureUpload';

function MyPage() {
  return (
    <div>
      <h1>My Custom Foreclosure Page</h1>
      <ForeclosureUpload onUploadComplete={() => {
        console.log('Upload complete!');
        // Refresh your data here
      }} />
    </div>
  );
}
```

---

## Database Migration

Before using this feature, run the Prisma migration to create the `foreclosures` table:

```bash
cd functions
npx prisma migrate dev --name add_foreclosures
```

Or in production:
```bash
cd functions
npx prisma migrate deploy
```

---

## API Endpoints

### Upload Foreclosure File
```
POST /api/foreclosure/upload

Body:
{
  "filename": "foreclosures.xlsx",
  "fileData": "base64-encoded-file-data",
  "mode": "standard" // or "address-only"
}

Response:
{
  "success": true,
  "fileId": "FC-1738363200000",
  "recordsProcessed": 328,
  "totalRecords": 328,
  "activeRecords": 328,
  "inactiveRecords": 0
}
```

### Get Foreclosures
```
GET /api/foreclosure?active=true

Response:
{
  "success": true,
  "data": [...foreclosure records...],
  "count": 328
}
```

### Delete All Foreclosures
```
DELETE /api/foreclosure

Response:
{
  "success": true,
  "message": "Deleted 328 foreclosure records"
}
```

---

## Features

✅ Intelligent column mapping (handles variations in column names)
✅ Batch processing (100 records per batch for performance)
✅ Full address parsing (splits "123 Main St, Austin, TX 78701" automatically)
✅ Active/Inactive record tracking
✅ Progress tracking during upload
✅ File validation (type, size)
✅ Error handling with detailed messages
✅ Export to CSV functionality
✅ Two upload modes (Standard / Address-Only)

---

## Testing

1. Start your backend server:
   ```bash
   cd functions
   npm run dev
   ```

2. Start your frontend:
   ```bash
   npm run dev
   ```

3. Navigate to the Foreclosure view

4. Click "Upload Foreclosure File"

5. Select your Excel file with foreclosure data

6. Choose upload mode (Standard or Address-Only)

7. Click Upload

8. View the processed records in the table

---

## Column Name Variations

The system automatically recognizes these variations:

| Expected Field | Recognized Variations |
|----------------|----------------------|
| Doc Number | `Doc Number`, `Document Number`, `DocNumber`, `doc_number` |
| Recorded Date | `Recorded Date`, `RecordedDate` |
| Sale Date | `Sale Date`, `SaleDate` |
| Full Address | `Full Address`, `FullAddress` |
| Street Address | `Street Address`, `Address`, `PropertyAddress` |
| Zip Code | `Zip Code`, `ZIP`, `ZipCode` |

---

## Error Handling

### Common Errors

**Missing Document Number**
- Error: "Missing Document Number"
- Solution: Ensure every row has a value in the Doc Number column

**Invalid File Type**
- Error: "Unsupported file format"
- Solution: Upload only .xlsx, .xls, or .csv files

**File Too Large**
- Error: "File size exceeds 100MB limit"
- Solution: Split your file into smaller chunks

**Empty File**
- Error: "File is empty or contains no valid data"
- Solution: Ensure your Excel file has at least one row of data

---

## Next Steps

1. Run the database migration
2. Restart your backend server
3. Add the ForeclosureView to your app navigation
4. Test the upload with your foreclosure data file

---

## Questions?

If you encounter any issues or need modifications:
- Check the browser console for detailed error messages
- Check the backend logs for processing errors
- Verify your Excel file has the required columns