# Latest Code from GitHub (Most Recent)

This document shows the **actual working code** that's currently on GitHub and deployed.

## Google Cloud Storage Initialization (Lines 14-43)

```javascript
// Initialize Storage with credentials
// Supports multiple credential methods:
// 1. Service account JSON from environment variable (for Render, Railway, etc.)
// 2. Service account key file path (for local dev)
// 3. Application Default Credentials (for Cloud Run, GCP)
const storageOptions = {};
if (process.env.GCP_PROJECT_ID) {
  storageOptions.projectId = process.env.GCP_PROJECT_ID;
}

// Method 1: Service account JSON from environment variable (for free hosting like Render)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    storageOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    console.log('[STORAGE] Using service account credentials from environment variable');
  } catch (error) {
    console.error('[STORAGE] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', error.message);
  }
}
// Method 2: Service account key file path (for local dev)
else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  console.log('[STORAGE] Using service account key file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
}
// Method 3: Application Default Credentials (for Cloud Run, GCP)
else {
  console.log('[STORAGE] Using Application Default Credentials (ADC)');
}

const storage = new Storage(storageOptions);
```

## Excel Parsing Code (Lines 213-254)

```javascript
console.log(`[PROCESS] Parsing Excel file`);
// Parse Excel
// Excel structure (per user requirements):
// Row 1: Empty or title - will be skipped
// Row 2: Descriptions (what each column is for) - will be skipped
// Row 3: Column headers/titles (actual column names) - used as headers
// Row 4+: Data rows - processed as property data

const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

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
if (Object.keys(descriptions).length > 0) {
  console.log(`[PROCESS] Row 2 descriptions found:`, Object.values(descriptions).filter(d => d).slice(0, 5).join(', '), '...');
}

// Use row 3 as headers (header: 2 means 0-indexed row 2, which is row 3 in Excel)
// This automatically skips rows 1-2 and uses row 3 as headers
// Data rows start from row 4 (0-indexed row 3)
data = XLSX.utils.sheet_to_json(worksheet, {
  raw: false,
  header: 2, // Use row 3 (0-indexed row 2) as headers
  defval: '', // Default value for empty cells
});

console.log(`[PROCESS] Using row 3 as headers. Found ${Object.keys(data[0] || {}).length} columns, ${data.length} data rows`);
```

## Column Mappings (Lines 341-349)

```javascript
const mappings = {
  accountNumber: ['can', 'account', 'account number', 'account_number', 'acct', 'acct no'],
  ownerName: ['owner', 'owner name', 'owner_name', 'name'],
  propertyAddress: ['addrstring', 'property address', 'property_address', 'address', 'property'],
  mailingAddress: ['mailing address', 'mailing_address', 'mailing'],
  status: ['legalstatus', 'status', 'st'],
  totalAmountDue: ['total', 'amount due', 'amount_due', 'due', 'balance'],
  totalPercentage: ['percentage', 'percent', 'pct', '%'],
};
```

## Key Features in Latest GitHub Code

✅ **Google Cloud Storage** - 3 credential methods (environment variable, key file, ADC)  
✅ **Excel Parsing** - Uses row 3 as headers (skips rows 1-2)  
✅ **Column Mappings** - Includes CAN, LEGALSTATUS, ADDRSTRING  
✅ **Row 2 Descriptions** - Reads and logs row 2 for debugging  
✅ **Data Processing** - Starts from row 4  

## Recent Commits on GitHub

Based on the git log, the latest commits include:
- `7296fe5` - Merge pull request #8 (Remove auto-refresh polling)
- `444e829` - Add CAN, LEGALSTATUS, ADDRSTRING column mappings and status tracking
- `a94c9be` - Merge with improved Excel parsing logging

## Current Deployment Status

- **Backend**: Deployed on Render (using Method 1 - JSON from environment variable)
- **Frontend**: Deployed on GitHub Pages
- **Storage**: Google Cloud Storage bucket `rbmcounty-cad-tracker-files`
- **Project**: `rbmcounty-cad-tracker`

This is the code that's currently live and working! 🎉

