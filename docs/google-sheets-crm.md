# Google Sheets Data

The **Google Sheets Data** navigation section displays a PostgreSQL copy of
the connected Government Hill workbook. Open `/login#sheetsCrm` on the public site.

The three worksheets are separate views: Parcels, Research Queue, and Outreach
Pipeline. Each supports search, status filtering, record details, edits, and
adding a record. A background import runs at API startup and every five minutes,
even without an open browser. Sync now triggers an immediate import. Refresh
reloads the stored copy. The view checks PostgreSQL for changes every 30 seconds.
The Instructions tab remains available in the workbook.

Each worksheet is stored in `google_sheet_snapshots`, keyed by spreadsheet ID and
worksheet ID. Imports atomically replace that worksheet's headers, rows, and
record count instead of appending duplicate records. Source edits, reordered rows,
new rows, and removed rows are reflected on the next successful import. These
copies do not merge into the existing Property or MLS tables.

The UI shows imported record counts, timestamps, and errors per worksheet. A
failed or truncated source read keeps the last successful rows and timestamp.
PostgreSQL advisory transaction locks prevent simultaneous imports by API replicas;
the transaction rolls back if a database write fails. Imports have a three-minute
transaction timeout. With the API stopped, scheduled imports pause until startup.

## Server setup

- Enable `sheets.googleapis.com` in the service account's Google Cloud project.
- Share the workbook with the service account as Editor.
- Credentials use `GOOGLE_SHEETS_CREDENTIALS_JSON` if present, otherwise the
  existing `GOOGLE_APPLICATION_CREDENTIALS_JSON`. The legacy Calendar account
  variables are a final fallback when neither JSON credential is configured.
- Credentials stay on the backend. The frontend receives only the service
  account's email and worksheet data after authentication and a tab subscription check.

The workbook and worksheet IDs are fixed in
`functions/src/lib/sheetsCrm.js`, so a client cannot query other spreadsheets
accessible to the same service account.

## Data handling

- The first row supplies field labels; it is never editable from the CRM.
- Reads are bounded to 26 columns and 50,000 worksheet rows. Imports exceeding
  this bound report an error and keep the previous copy rather than clipping it.
- Save changes only the selected cells' `userEnteredValue`, preserving other
  cells, formatting, validation, and formulas.
- Formula cells and validation types the app cannot safely evaluate are read-only.
- Existing list dropdowns and standard checkbox rules are respected.
- Text is written literally, including text starting with `=`. Appraised values,
  prices, lot size, and valuation year are written as numbers.
- Before an edit, the backend re-reads the row and checks its version and headers.
  Changes or sorting detected since opening the record cause a conflict response.
  Google Sheets has no atomic compare-and-set operation: simultaneous edits made
  directly in Sheets during the short final read/write interval remain possible.
- Edits and new records save to the original worksheet and then import that
  worksheet into PostgreSQL. If the source save succeeds but the import is busy
  or fails, the response reports a pending import instead of a failed save,
  preventing a retry from accidentally appending the same new record again.
- No source delete or whole-sheet replacement is exposed.
- Every route requires authentication and a Government Hill subscription configured
  in Manager Settings. Admins/operators can edit; subscribed viewers can read.
  Manager teammate view remains blocked for this shared workbook. Responses use
  `Cache-Control: no-store`.
- Subscribed admins/operators can use Sync now; viewers can read imported data.
- The database remains readable if a later Google request fails. Google Sheets
  remains the source of truth, including for edits initiated in the CRM.

## Verification

```powershell
npm test -- functions/src/lib/sheetsSync.test.js functions/src/lib/sheetsCrm.test.js functions/src/routes/sheetsCrm.test.js src/components/sheets-crm/SheetsCrmView.test.tsx
npm run build
```

The tests use synthetic spreadsheet data. They do not modify production rows.
