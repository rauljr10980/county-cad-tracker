CREATE TABLE IF NOT EXISTS "google_sheet_snapshots" (
  "spreadsheetId" TEXT NOT NULL,
  "sheetId" INTEGER NOT NULL,
  "workbookTitle" TEXT NOT NULL DEFAULT 'Government Hill',
  "tabTitle" TEXT NOT NULL,
  "headers" JSONB NOT NULL DEFAULT '[]',
  "rows" JSONB NOT NULL DEFAULT '[]',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "syncedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  PRIMARY KEY ("spreadsheetId", "sheetId")
);
