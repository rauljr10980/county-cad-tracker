# 20260729000000_add_eviction_crm_fields

Operational steps for deploying this migration. These cannot be automated
from inside the SQL, so they're documented here instead.

## Before deploying

1. **Run this inventory against production and save the output.** The
   migration's `DO $$ ... RAISE WARNING $$` block reports unmapped
   `contactStage` values, but `RAISE WARNING` lands in the Postgres server
   log, not in `prisma migrate deploy` output — so this query is the only
   reporting channel anyone will actually read:

   ```sql
   SELECT "contactStage", COUNT(*) FROM "eviction_landlords" GROUP BY 1 ORDER BY 2 DESC;
   ```

   Any value outside the 12-value vocabulary (`New Lead`, `Researching`,
   `Ready to Contact`, `Attempted Contact`, `Contacted`, `Follow-Up`,
   `Appointment Scheduled`, `Interested`, `Not Interested`,
   `Under Contract`, `Closed`, `Do Not Contact`) will pass through
   untouched by design — note which ones. Re-run this query after deploy
   to confirm the pre/post counts add up (the four legacy values should
   have moved to their mapped stage; everything else should be unchanged).

2. **Take a database snapshot immediately before deploy.** This repo has
   no down migrations anywhere, including this one — the snapshot is the
   only rollback path.
