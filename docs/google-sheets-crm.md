# Government Hill Google Sheets CRM

The **Government Hill** navigation section connects directly to
the selected acquisition workbook. Open `/login#sheetsCrm` on the public site.

The three worksheets are separate views: Parcels, Research Queue, and Outreach
Pipeline. Each supports search, status filtering, record details, edits, and
adding a record. Saving writes to the source worksheet; it does not import or
merge records into the existing PostgreSQL CRM. Click Refresh to pick up edits
made in Google Sheets. The Instructions tab remains available in the workbook.

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
- Reads are bounded to 26 columns and the first 1,000 records.
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
- New records append to the tab. No delete or whole-sheet replacement is exposed.
- Every route requires authentication and a Government Hill subscription configured
  in Manager Settings. Admins/operators can edit; subscribed viewers can read.
  Manager teammate view remains blocked for this shared workbook. Responses use
  `Cache-Control: no-store`.
- The connection panel shows the most recent successful read and explicitly says
  PostgreSQL transfer is not configured. Reads happen when the view opens, after
  a save, on worksheet changes, or on Refresh. There is no background transfer job.

## Verification

```powershell
npm test -- functions/src/lib/googleSheets.test.js functions/src/lib/sheetsCrm.test.js functions/src/routes/sheetsCrm.test.js src/components/sheets-crm/SheetsCrmView.test.tsx
npm run build
```

The tests use synthetic spreadsheet data. They do not modify production rows.
