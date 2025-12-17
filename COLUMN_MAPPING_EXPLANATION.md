# Column Mapping Explanation: CAN, LEGALSTATUS, ADDRSTRING

## What These Columns Are For

Based on your Excel file structure, here's what each column does:

### **CAN** (Column Name)
- **Purpose**: Account Number / Property Identifier
- **Maps to**: `accountNumber` field in the Property object
- **What it's used for**: 
  - Unique identifier for each property
  - Used to track properties across different file uploads
  - Used to compare properties between files (to detect new/removed/changed properties)
  - Displayed in the property table as the account number

### **LEGALSTATUS** (Column Name)
- **Purpose**: Legal Status of the Property
- **Maps to**: `status` field in the Property object
- **What it's used for**:
  - Indicates the current status of the property (typically: J = Judgment, A = Active, P = Pending)
  - Used to filter properties by status in the dashboard
  - Used to detect status changes when comparing files
  - Displayed as a status badge in the property table
  - Used in status transition tracking (e.g., "A->J" means changed from Active to Judgment)

### **ADDRSTRING** (Column Name)
- **Purpose**: Property Address String
- **Maps to**: `propertyAddress` field in the Property object
- **What it's used for**:
  - The physical address of the property
  - Displayed in the property table
  - Used for property identification and location tracking
  - May be used for address-based searches or filtering

## How The Software Uses Them

1. **When you upload an Excel file:**
   - The software reads row 3 to get column names (CAN, LEGALSTATUS, ADDRSTRING, etc.)
   - It maps these columns to the appropriate property fields
   - It extracts data from each row starting from row 4

2. **Data Extraction:**
   - **CAN** → becomes `property.accountNumber`
   - **LEGALSTATUS** → becomes `property.status` (converted to uppercase: J, A, or P)
   - **ADDRSTRING** → becomes `property.propertyAddress`

3. **Property Tracking:**
   - Properties are tracked by their `accountNumber` (from CAN column)
   - When you upload a new file, the software compares properties by account number
   - It detects:
     - **New properties**: Account numbers in new file that weren't in previous file
     - **Removed properties**: Account numbers in previous file that aren't in new file
     - **Changed properties**: Same account number but different status or percentage

4. **Display in UI:**
   - **CAN** appears in the "Account" column of the property table
   - **LEGALSTATUS** appears as a colored status badge (J/A/P)
   - **ADDRSTRING** appears in the "Property Address" column

## Current Code Mapping

The `extractProperties` function in `functions/index.js` now includes these exact column names:

```javascript
const mappings = {
  accountNumber: ['can', 'account', 'account number', ...],
  propertyAddress: ['addrstring', 'property address', ...],
  status: ['legalstatus', 'status', 'st', ...],
  // ... other mappings
};
```

This means:
- If your Excel file has a column named **"CAN"** (in row 3), it will be used as the account number
- If your Excel file has a column named **"LEGALSTATUS"** (in row 3), it will be used as the status
- If your Excel file has a column named **"ADDRSTRING"** (in row 3), it will be used as the property address

## Example

If your Excel file looks like this:

| Row | CAN | LEGALSTATUS | ADDRSTRING | ... |
|-----|-----|-------------|------------|-----|
| 1   | (empty/title) | | | |
| 2   | Account Number | Legal Status | Property Address | |
| 3   | CAN | LEGALSTATUS | ADDRSTRING | |
| 4   | 12345 | A | 123 Main St | |
| 5   | 67890 | J | 456 Oak Ave | |

The software will:
- Skip rows 1-2
- Use row 3 as headers
- Extract row 4 as: `{ accountNumber: "12345", status: "A", propertyAddress: "123 Main St" }`
- Extract row 5 as: `{ accountNumber: "67890", status: "J", propertyAddress: "456 Oak Ave" }`

## Notes

- The column name matching is **case-insensitive** and **flexible** - it will match variations like "CAN", "can", "Can", etc.
- If a column name doesn't match any mapping, that data won't be extracted (but won't cause an error)
- The software will still work if you use different column names - it will just try to match them to the closest field

