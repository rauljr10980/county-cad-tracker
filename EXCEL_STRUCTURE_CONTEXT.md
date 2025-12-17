# Excel File Structure Context

## User's Excel File Format

The user's Excel files have a specific structure that differs from standard Excel files:

### Row Structure:
- **Row 1**: Empty or contains a title (ignored/skipped)
- **Row 2**: Contains **descriptions** - explains what each column is for (e.g., "Account number", "Property owner name", "Property address")
- **Row 3**: Contains **column titles/headers** - the actual column names used for data extraction (e.g., "ACCT", "OWNER", "ADDRESS")
- **Row 4+**: Contains the actual property data rows

### Why This Matters:
- Standard Excel parsing typically uses row 1 as headers
- This user's files use row 3 as headers
- Row 2 provides context about what each column represents, which is helpful for understanding the data structure

## Code Changes Made

### File: `functions/index.js`

**Updated Excel parsing logic** in the `processFile` function:

1. **Changed header row from row 1 to row 3**:
   - Old: Used `XLSX.utils.sheet_to_json(worksheet)` which defaults to row 1 as headers
   - New: Uses `XLSX.utils.sheet_to_json(worksheet, { header: 2 })` which uses row 3 (0-indexed row 2) as headers

2. **Added row 2 description reading**:
   - Code now reads row 2 for descriptions (for logging/debugging purposes)
   - This helps understand what each column represents

3. **Data processing**:
   - Rows 1-2 are skipped
   - Row 3 is used as column headers
   - Data processing starts from row 4

### Code Snippet:
```javascript
// Excel structure:
// Row 1: (empty or title) - will be skipped
// Row 2: Descriptions (what each column is for) - will be skipped
// Row 3: Column headers/titles (actual column names) - used as headers
// Row 4+: Data rows - processed as property data

// Read row 2 for descriptions (for logging/debugging)
const descriptions = {};
Object.keys(worksheet).forEach(cell => {
  const cellRef = XLSX.utils.decode_cell(cell);
  if (cellRef.r === 1 && cell[0] !== '!') { // Row 2 (0-indexed row 1)
    const colLetter = XLSX.utils.encode_col(cellRef.c);
    const value = worksheet[cell]?.v || '';
    if (value) descriptions[colLetter] = value;
  }
});

// Use row 3 as headers (header: 2 means 0-indexed row 2, which is row 3 in Excel)
data = XLSX.utils.sheet_to_json(worksheet, { 
  raw: false,
  header: 2, // Use row 3 (0-indexed row 2) as headers
  defval: '', // Default value for empty cells
});
```

## Current Status

✅ **Completed:**
- Updated Excel parsing to use row 3 as headers
- Added row 2 description reading for logging
- Code now correctly skips rows 1-2 and processes data from row 4

⏳ **Pending (if needed):**
- The `extractProperties` function currently uses flexible column name matching
- If the user provides exact column names from row 3, we can update `extractProperties` for precise mapping
- This would improve accuracy and reduce potential mismatches

## User's Original Request

The user stated:
> "description is in row 2 and title is in row 3 they explain what each of those are for"

This was in response to a question about how the software should read Excel files, after the user had already explained that their Excel files have this specific structure.

## Related Files

- `functions/index.js` - Contains the Excel parsing logic
- `EXCEL_FORMAT_GUIDE.md` - General guide on Excel format (may need updating to reflect this structure)

## Deployment

- Changes have been committed and pushed to the repository
- Render will automatically deploy the updated backend
- Once deployed, new Excel file uploads will use row 3 as headers

