# 20260729000000_add_eviction_crm_fields

Operational steps for deploying this migration. These cannot be automated
from inside the SQL, so they're documented here instead.

## ⚠️ This migration file does not execute on deploy

Railway starts this service through `Dockerfile` -> `functions/start.sh`,
which runs `prisma db push --accept-data-loss`. `db push` syncs the schema
from `schema.prisma` and **never reads the `migrations/` directory**. The
`railway:start` script in the root `package.json` does call
`prisma migrate deploy`, but nothing invokes it.

What that means in practice:

- The **column changes** here (`assignedToId`, its FK and index, the
  `contactStage` default) land anyway, because `db push` derives them from
  `schema.prisma`.
- The **row updates** — the legacy stage remap — would not run at all.
  They are therefore duplicated as `prisma db execute` statements in
  `functions/start.sh`, alongside the other one-off data migrations that
  already live there. The two must be kept in agreement.

This file remains the readable record of the change and the source of the
mapping. Treat `start.sh` as the thing that actually runs.

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
