# Excel File Format Guide

This document explains how the County CAD Tracker reads and processes Excel files.

## How It Works

### Step 1: File Upload
1. User uploads an Excel file (`.xlsx` or `.xls`) through the web interface
2. File is sent to the backend as base64-encoded data
3. Backend saves the file to Google Cloud Storage

### Step 2: Excel Parsing
The system uses the `xlsx` library to read the Excel file:

```javascript
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];  // Uses the FIRST sheet
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });
```

**Important:**
- Only the **first sheet** is processed
- All rows are converted to JSON objects
- Column headers become object keys

### Step 3: Column Mapping (Smart Detection)

The system automatically detects columns by matching header names (case-insensitive, flexible matching):

#### Required Columns

| Property Field | Excel Column Name Variations |
|----------------|------------------------------|
| **Account Number** | `account`, `account number`, `account_number`, `acct`, `acct no` |
| **Owner Name** | `owner`, `owner name`, `owner_name`, `name` |
| **Property Address** | `property address`, `property_address`, `address`, `property` |
| **Mailing Address** | `mailing address`, `mailing_address`, `mailing` |
| **Status** | `status`, `st` |
| **Total Amount Due** | `total`, `amount due`, `amount_due`, `due`, `balance` |
| **Total Percentage** | `percentage`, `percent`, `pct`, `%` |

#### How Matching Works

The system:
1. Looks at all column headers in your Excel file
2. Converts them to lowercase and trims whitespace
3. Checks if the header **contains** any of the variations listed above
4. Maps the first matching column to that property field

**Example:**
- If your Excel has a column named "Account #", it won't match (doesn't contain "account")
- If your Excel has "Account Number" or "ACCOUNT" or "Account_No", it WILL match
- If your Excel has "Total Amount Due" or "Amount Due" or "Balance", it will match to `totalAmountDue`

### Step 4: Data Extraction

For each row in the Excel file:

```javascript
{
  id: "timestamp_index",
  accountNumber: "value from account column" || "UNKNOWN_index",
  ownerName: "value from owner column" || "",
  propertyAddress: "value from address column" || "",
  mailingAddress: "value from mailing column" || "",
  status: "first character of status column, uppercase" || "A",
  totalAmountDue: parseFloat(amount column) || 0,
  totalPercentage: parseFloat(percentage column) || 0
}
```

**Status Handling:**
- Takes the first character of the status column
- Converts to uppercase
- Defaults to "A" (Active) if empty
- Valid statuses: "J" (Judgment), "A" (Active), "P" (Pending)

**Filtering:**
- Rows without an account number are filtered out
- Rows with "UNKNOWN" account numbers are filtered out

## Example Excel Format

### Recommended Column Headers

Your Excel file should have these columns (exact names don't matter, as long as they contain the keywords):

| Account Number | Owner Name | Property Address | Mailing Address | Status | Total Amount Due | Total Percentage |
|----------------|------------|------------------|-----------------|--------|------------------|------------------|
| 123456 | John Doe | 123 Main St | PO Box 123 | J | 15000.00 | 25.5 |
| 789012 | Jane Smith | 456 Oak Ave | 456 Oak Ave | A | 8500.00 | 15.0 |

### Alternative Column Names That Work

| Account | Owner | Address | Mailing | St | Amount Due | % |
|---------|-------|---------|---------|----|-----------|---|
| 123456 | John Doe | 123 Main St | PO Box 123 | J | 15000.00 | 25.5 |

Both formats will work because the system matches keywords!

## Processing Flow

1. **Upload** → File saved to `uploads/{fileId}_{filename}`
2. **Parse** → Excel converted to JSON array
3. **Extract** → Properties extracted using column mapping
4. **Save** → Properties saved to `data/properties/{fileId}.json`
5. **Compare** → Compared with previous file (if exists)
6. **Update** → File status set to "completed"

## Status Values

The system expects status values to be:
- **J** = Judgment
- **A** = Active  
- **P** = Pending

If your Excel uses different values (like "Judgment", "Active", "Pending"), the system will:
- Take the first character: "Judgment" → "J", "Active" → "A"
- Convert to uppercase
- Use that as the status

## Troubleshooting

### "No properties extracted"
- Check that your Excel has at least one row of data
- Verify column headers contain the keywords listed above
- Make sure the Account Number column has values

### "Wrong data in properties"
- Check column header names match the variations
- Verify data types (amounts should be numbers, not text)
- Check for empty rows that might be included

### "Status not showing correctly"
- Status column should contain: J, A, P (or Judgment, Active, Pending)
- System takes first character only
- Defaults to "A" if empty

## Current Implementation

The extraction function is located in:
- **File:** `functions/index.js`
- **Function:** `extractProperties(data)`
- **Lines:** 309-349

You can modify the `mappings` object to add more column name variations if your Excel files use different headers.

