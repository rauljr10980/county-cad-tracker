# Per-User CRM Isolation

**Date:** 2026-08-26
**Status:** Approved for planning

## Goal

Give every user their own CRM. A user signs in and sees only the leads, deals,
tasks, and activities they created; another user's records do not exist as far
as their account is concerned. The existing records — all of them — stay with
the account that owns them today.

## Why now

`PUT /api/crm/state` deletes across every account. The route takes the client's
payload and removes anything absent from it, with no ownership filter:

```js
await tx.crmActivity.deleteMany({ where: { id: { notIn: incomingActivityIds } } });
await tx.crmTask.deleteMany({ where: { id: { notIn: incomingTaskIds } } });
await tx.crmDeal.deleteMany({ where: { id: { notIn: incomingDealIds } } });
await tx.crmLead.deleteMany({ where: { id: { notIn: incomingLeadIds } } });
```

None of the four `Crm*` models carries an owner column, and `GET /state` returns
every row in the table. So a second account opening the CRM tab loads everyone's
records, and its next save deletes every record it did not receive. Last write
wins; everything else is gone.

This is not a latent risk to design around later. It is live, and it is why
per-user isolation is also a data-preservation fix.

## Scope

**In scope:** the CRM tab — `CrmLead`, `CrmDeal`, `CrmTask`, `CrmActivity`, and
the two routes in `functions/src/routes/crm.js`.

**Out of scope:** the Evictions CRM (`EvictionLandlord` and friends), Properties,
Pre-Foreclosure, Driving 4$. Those stay shared. An admin view across users is
also out of scope — see Decisions.

## Decisions

**Ownership lives on `CrmLead` only.** `CrmDeal`, `CrmTask`, and `CrmActivity`
each have a required `leadId` with `onDelete: Cascade`, so every CRM record
already hangs off exactly one lead. One column, one index, one backfill.
Children are filtered through the relation. Denormalizing `userId` onto all four
models was rejected: it adds three columns to keep in sync and a new way to be
wrong — a task whose owner disagrees with its lead's.

**Strict isolation.** No user sees another's CRM records, `ADMIN` included. There
is no cross-user view and no role check. If an admin overview is wanted later it
is a new feature, not a flag left half-wired here.

**Existing rows go to the oldest account.** The backfill assigns every
null-owner lead to the first-registered user. Chosen over naming a username in
the migration (no secret to keep in git) and over a Railway environment variable
(no deploy step, nothing to misspell). The tradeoff is that it is implicit: if
some other account registered first, the data lands on the wrong one.

**Not separate databases.** The request was phrased as "a different CRM database
per user". Row-level ownership produces the identical user-visible result
without provisioning or migrating one database per account.

## Schema

Add to `CrmLead`:

- `userId String?` — nullable
- a relation to `User` with `onDelete: Cascade`, so deleting a user removes
  their CRM records
- `@@index([userId])`

Nullable is not a preference; it is forced. Railway runs
`prisma db push --accept-data-loss` against a populated table, and a required
column with no default fails there. The column stays nullable in the schema and
is always set in application code.

## Backfill

An idempotent statement in `functions/start.sh`, alongside the existing data
migrations:

```
UPDATE "crm_leads" SET "userId" = (SELECT id FROM users ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;
```

It belongs in `start.sh` rather than in `prisma/migrations/` because this project
never runs `prisma migrate deploy` — `start.sh` runs `db push`, which syncs the
schema and executes nothing in `migrations/`. A migration file would look correct
and silently never run. This is the same reasoning that put the eviction stage
remap there.

Idempotent by construction: after the first run the `WHERE` clause matches
nothing. It must also be a no-op when the users table is empty rather than
setting `userId` to null.

## Endpoints

`GET /api/crm/state` filters leads by `req.user.id`, and the three child
collections by `{ lead: { userId: req.user.id } }`.

`PUT /api/crm/state` applies the same filter to all four `deleteMany` calls and
stamps `userId: req.user.id` on lead creates. Scoping the deletes is what closes
the cross-account wipe.

Both already run behind `authenticateToken`, so `req.user.id` is present.

## Empty-payload guard

Scoping the deletes stops one account from destroying another's data. It does
not stop an account from destroying its own: if the client's load fails and it
then autosaves an empty state, the save deletes everything the user has.

`PUT /state` rejects a payload with no leads while the account has existing
leads, returning `409` with an error message the client surfaces, instead of
deleting. Clearing a CRM deliberately is rare; losing one to a failed fetch is
not a tradeoff worth making.

The guard triggers on the lead count alone. A payload carrying leads but no
deals, tasks, or activities is a legitimate state — those are all deletable
down to zero while leads remain — and passes through normally.

## Testing

Backend tests under `functions/src/**/*.test.js`, which the existing Vitest
config already picks up:

- user A's save leaves user B's leads, deals, tasks, and activities untouched
- `GET /state` returns only the requesting user's records
- the empty-payload guard rejects, and does not delete
- a payload that legitimately removes one lead still removes it
- the backfill targets only null-owner rows and no-ops on a second run

The scoping logic should be extracted into a testable unit rather than tested
through a live database — `functions/src/lib/pipelineQueues.js` is the precedent,
extracted for exactly this reason.

## Risks

**The backfill picks the wrong account** if someone registered before the
intended owner. Visible immediately on next login (an empty CRM), and correctable
with a single `UPDATE`.

**Data may already be lost.** The destructive sync has been live. This design
prevents further loss; it cannot recover what is already gone. The production
database has not been inspected — it is not reachable from the development
environment.

**A user deleted removes their CRM records**, by `onDelete: Cascade`. Intended,
and worth stating because it is irreversible.
