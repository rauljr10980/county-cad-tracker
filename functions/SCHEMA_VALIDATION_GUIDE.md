# PostgreSQL Schema Validation Guide

Before uploading Excel data to PostgreSQL, it's important to validate that:
1. The database schema matches the Prisma schema
2. Data types are compatible
3. Required fields are present
4. Data values are valid

## Step 1: Validate Schema

Run the validation script to check your database schema:

```bash
cd functions
node validate-schema-and-data.js
```

This script will:
- ✅ Check if the `properties` table exists
- ✅ Compare actual schema with expected Prisma schema
- ✅ Identify missing columns
- ✅ Identify type mismatches
- ✅ Check existing data for issues
- ✅ Provide recommendations

### Expected Output

If everything is correct:
```
✅ Schema matches Prisma schema perfectly!
✅ No data issues found
✅ Schema validation passed. Safe to upload data.
```

If there are issues:
```
❌ Missing columns (2):
   - marketValue (expected: double precision)
   - landValue (expected: double precision)

⚠️  Type mismatches (1):
   - exemptions: expected text[], got text

💡 RECOMMENDATIONS:
1. Run Prisma migrations to add missing columns:
   cd functions
   npx prisma migrate dev
```

## Step 2: Fix Schema Issues

If the validation script finds issues:

### Missing Columns
Run Prisma migrations:
```bash
cd functions
npx prisma migrate dev
# OR
npx prisma db push
```

### Type Mismatches
If types don't match, you may need to:
1. Update the Prisma schema
2. Create a migration
3. Or manually alter the table (not recommended)

### Data Issues
If existing data has issues:
- NULL values in required fields: Update or delete invalid rows
- Invalid status values: Update to valid values (JUDGMENT, ACTIVE, PENDING, PAID, REMOVED)
- Array fields as NULL: Update to empty arrays `[]`

## Step 3: Upload Data

Once validation passes, you can safely upload:

```bash
cd functions
node upload_excel_to_properties_table.js "path/to/your/file.xlsx"
```

## What the Upload Script Does

The updated upload script:
- ✅ Extracts all fields from Excel, including all "NEW-" columns
- ✅ Validates numeric values
- ✅ Handles PostgreSQL arrays correctly (exemptions, jurisdictions)
- ✅ Truncates strings to safe lengths
- ✅ Sets default values for required fields (phoneNumbers, isNew, etc.)
- ✅ Uses proper data types for all fields

## Field Mapping

The script extracts these fields from Excel:

### Basic Fields
- `accountNumber` ← NEW-Account Number
- `ownerName` ← NEW-Owner Name
- `propertyAddress` ← NEW-Property Site Address
- `mailingAddress` ← NEW-Owner Address
- `totalDue` ← NEW-Total Amount Due
- `status` ← LEGALSTATUS column

### Additional Fields (NEW- columns)
- `legalDescription` ← NEW-Legal Description
- `marketValue` ← NEW-Total Market Value
- `landValue` ← NEW-Land Value
- `improvementValue` ← NEW-Improvement Value
- `cappedValue` ← NEW-Capped Value
- `agriculturalValue` ← NEW-Agricultural Value
- `exemptions` ← NEW-Exemptions (converted to array)
- `jurisdictions` ← NEW-Jurisdictions (converted to array)
- `lastPaymentDate` ← NEW-Last Payment Date
- `lastPaymentAmount` ← NEW-Last Payment Amount Received
- `lastPayer` ← NEW-Last Payer
- `delinquentAfter` ← NEW-Delinquent After
- `halfPaymentOptionAmount` ← NEW-Half Payment Option Amount
- `priorYearsAmountDue` ← NEW-Prior Years Amount Due
- `taxYear` ← NEW-Tax Year
- `yearAmountDue` ← NEW-Year Amount Due
- `yearTaxLevy` ← NEW-Year Tax Levy
- `link` ← NEW-Link
- `ownerAddress` ← NEW-Owner Address

### Default Values
- `phoneNumbers` = `[]` (empty array)
- `isNew` = `false`
- `isRemoved` = `false`
- `statusChanged` = `false`
- `percentageChanged` = `false`

## Troubleshooting

### Error: "Column missing from database"
Run Prisma migrations to sync the schema:
```bash
cd functions
npx prisma migrate deploy
```

### Error: "Invalid input syntax for type array"
The array fields (exemptions, jurisdictions) must be valid arrays. The script handles this automatically, but if you see this error, check that the Excel data is properly formatted.

### Error: "NULL value in column violates NOT NULL constraint"
Required fields cannot be NULL. The script sets defaults for required fields, but if you see this error, check:
- accountNumber is present
- ownerName is present
- propertyAddress is present
- totalDue is a valid number

### Error: "Invalid status value"
Status must be one of: JUDGMENT, ACTIVE, PENDING, PAID, REMOVED
The script automatically converts invalid statuses to ACTIVE.

## Best Practices

1. **Always validate schema first** before uploading large datasets
2. **Backup your database** before bulk uploads
3. **Test with a small sample** first (first 10 rows)
4. **Check the validation output** carefully
5. **Fix schema issues** before uploading data

## Next Steps

After successful upload:
1. Verify data in the database
2. Check a few sample records
3. Run the validation script again to ensure no data issues
4. Test your application with the new data


