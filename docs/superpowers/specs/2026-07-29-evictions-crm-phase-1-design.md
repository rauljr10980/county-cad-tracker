# Evictions CRM — Phase 1 Design

**Date:** 2026-07-29
**Status:** Approved for planning
**Scope:** Phase 1 of 3. Phases 2 and 3 are listed under [Out of Scope](#out-of-scope).

## Context

The platform has an Eviction List tab backed by six Postgres tables holding 3,139
landlord prospects grouped from Bexar County eviction filings. That tab is a flat
table with filters and a detail dialog. It is not a CRM: there is no pipeline, no
assignment, no dashboard, and no way to work a lead through stages.

This adds a dedicated Evictions CRM workspace inside the existing Real Estate
Acquisitions platform, reached through a new item in the Header menu. The existing
Eviction List tab stays.

## Decisions

| Question | Decision |
| --- | --- |
| Eviction List tab styling | Stays light/corporate — PR #19 merges. The new CRM uses the dark teal theme. |
| "Login to Evictions CRM" | Same accounts, re-enter password. A soft UI gate, not enforcement. |
| Build order | Phase 1 ships and gets used before phases 2 and 3 are specced. |
| CRM membership | Every landlord is automatically a CRM lead. One shared record, no convert step. |

## Goals

1. A workspace that feels separate from the platform but reads and writes the same
   eviction data.
2. A 12-stage pipeline replacing the current 7-stage `contactStage` vocabulary.
3. A dashboard answering "what should I work on today".
4. A landlord profile consolidating identity, contacts, properties, filings, and
   ownership of the lead.

## Non-Goals

Phase 1 does not add calendars, appointments, communication logs, follow-up
sequences, saved filters, bulk actions, CSV export, or reporting. It does not add
role-based enforcement on the eviction endpoints.

The `eviction_tasks` table already exists and the current tab already creates
follow-ups. Phase 1 *reads* those for the dashboard and profile. It does not add
scheduling UI beyond what the Eviction List dialog has today.

## Architecture

### Sync model

There is one record per landlord. The Eviction List tab and the Evictions CRM both
read and write `eviction_landlords` directly. The CRM adds columns to that table
rather than copying rows into a CRM-specific table.

This makes the two requirements — automatic sync, and no duplicate contacts —
structural rather than something to maintain. There is no sync job, no convert
action, and no reconciliation path, because there is only ever one row. A stage
change made in the Eviction List dialog is the same write the pipeline board makes.

### Workspace shell

The CRM is a full-screen takeover at the `#evictions-crm` hash, rendered outside
the platform's `TabNavigation`. It has its own left sidebar with Dashboard,
Pipeline, and Leads, plus a "Back to platform" control returning to `#evictions`.

It is styled with the app's existing dark theme tokens from `src/index.css`. No new
styling system is introduced. The corporate `.urg` scope added for the Eviction List
tab is not used here.

## Stage vocabulary

The 7 current stages are replaced by 12. Because both views share one record, both
use this list.

`New Lead`, `Researching`, `Ready to Contact`, `Attempted Contact`, `Contacted`,
`Follow-Up`, `Appointment Scheduled`, `Interested`, `Not Interested`,
`Under Contract`, `Closed`, `Do Not Contact`

### Data migration

Existing rows are remapped in the same migration that widens the vocabulary:

| Current value | Becomes |
| --- | --- |
| `New` | `New Lead` |
| `Researching` | `Researching` |
| `Contacted` | `Contacted` |
| `Follow Up` | `Follow-Up` |
| `Qualified` | `Interested` |
| `Not Interested` | `Not Interested` |
| `Do Not Call` | `Do Not Contact` |

Any value not in the left column is left untouched and reported by the migration
rather than silently coerced, so unexpected data surfaces instead of disappearing.

The default for new rows changes from `'New'` to `'New Lead'`.

**Consequence:** the Eviction List tab's stage dropdown must be updated to the same
12 values. This is a functional change to a tab that was otherwise being left alone,
and it is unavoidable while both views share one record.

## Data model changes

One migration, `add_eviction_crm_fields`:

```sql
ALTER TABLE "eviction_landlords" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "eviction_landlords"
  ADD CONSTRAINT "eviction_landlords_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "eviction_landlords_assignedToId_idx"
  ON "eviction_landlords"("assignedToId");

ALTER TABLE "eviction_landlords" ALTER COLUMN "contactStage" SET DEFAULT 'New Lead';
UPDATE "eviction_landlords" SET "contactStage" = 'New Lead'  WHERE "contactStage" = 'New';
UPDATE "eviction_landlords" SET "contactStage" = 'Follow-Up' WHERE "contactStage" = 'Follow Up';
UPDATE "eviction_landlords" SET "contactStage" = 'Interested' WHERE "contactStage" = 'Qualified';
UPDATE "eviction_landlords" SET "contactStage" = 'Do Not Contact' WHERE "contactStage" = 'Do Not Call';
```

`ON DELETE SET NULL` means deleting a user unassigns their leads rather than
cascading the landlords away.

The corresponding `schema.prisma` change adds `assignedToId String?`, an
`assignedTo User?` relation, and an `evictionLandlords EvictionLandlord[]` back-
relation on `User`.

## API surface

### New: `POST /api/auth/verify-password`

Authenticated. Body `{ password }`. Bcrypt-compares against the signed-in user's
stored hash. Returns `{ ok: true }` or 401. Rate limited to 5 attempts per minute
per user to keep it from being a password oracle.

### New: `GET /api/evictions/stats`

Returns the dashboard figures in one round trip:

```json
{
  "total": 3139,
  "byStage": { "New Lead": 2727, "Researching": 168 },
  "byService": { "Undecided": 2901, "Listing": 68 },
  "byAssignee": [{ "userId": "…", "username": "raul", "count": 412 }],
  "unassigned": 2727,
  "followUpsDue": { "overdue": 6, "today": 4, "next7": 23 },
  "activeOpportunities": 44,
  "closedDeals": 12
}
```

Definitions, so the numbers are not ambiguous:

- `activeOpportunities` — stage in (`Interested`, `Under Contract`)
- `closedDeals` — stage `Closed`
- `appointments` — stage `Appointment Scheduled`, read from `byStage`
- `followUpsDue` — incomplete rows in `eviction_tasks` bucketed by `dueAt`

### Extended: `GET /api/evictions/landlords`

Two new query params. Existing behavior is the default, so the Eviction List tab is
unaffected:

- `corporate` — `false` (default, current behavior), `true`, or `all`
- `assignedTo` — a user id, or `unassigned`

### Extended: `PATCH /api/evictions/landlords/:id`

`assignedToId` joins the existing allowlist.

### Reused

The pipeline board loads each column with
`GET /landlords?stage=<stage>&pageSize=25&corporate=all`. The profile uses the
existing `GET /landlords/:id`.

## Frontend structure

```
src/crm-evictions/
  auth/        PasswordGateDialog, useCrmGrant (sessionStorage, TTL)
  shell/       EvictionsCrmWorkspace, CrmSidebar
  api/         evictionsCrm.ts — typed calls, shared request wrapper
  types/       crm.ts — Stage union, Lead, LeadDetail, Stats
  dashboard/   DashboardPage, KpiTiles, StageDistribution, AssigneeBreakdown
  pipeline/    PipelinePage, StageColumn, LeadCard  (@dnd-kit)
  leads/       LeadsPage, LeadProfile, panels/
  constants.ts STAGES, STAGE_ORDER, stage tone mapping
```

`STAGES` is the single source of truth for the vocabulary and is imported by the
Eviction List tab too, so the two lists cannot drift.

Touchpoints in existing code:

- [Header.tsx](../../../src/components/layout/Header.tsx) — menu item
- [Index.tsx](../../../src/pages/Index.tsx) — `#evictions-crm` route
- [EvictionLeadsView.tsx](../../../src/crm/views/EvictionLeadsView.tsx) — import `STAGES`

## Security

The password gate is a UI affordance, not access control. The existing JWT still
authorizes every `/api/evictions` request, so the data is reachable with that token
whether or not the prompt was satisfied. The grant lives in `sessionStorage` and
dies with the tab.

This is deliberate and matches what was asked for. If enforcement is wanted later,
it needs a role or permission check on the eviction routes, which is a separate
change.

## Testing

The repo has no test runner today. This adds Vitest and covers the two places a
silent error corrupts data or misleads:

1. **Stage mapping** — every current value maps to exactly one new value; unknown
   values pass through untouched.
2. **Stats derivation** — `activeOpportunities`, `closedDeals`, and the
   `followUpsDue` buckets, including boundaries (due exactly now, due at midnight).

Plus a smoke test that the pipeline renders 12 columns from `STAGES` and that a drag
issues one PATCH with the target stage.

Not covered: the password gate against real bcrypt, and anything requiring a live
database.

## Risks

| Risk | Mitigation |
| --- | --- |
| Stage migration is destructive and hard to reverse | Migration reports unmapped values instead of coercing; mapping is unit tested before it runs |
| Pipeline opens with 3,139 cards in `New Lead` | Each column shows its total count in the header and lazy-loads 25 cards at a time with load-more. Filtering to assigned-to-me is offered but not the default, since every lead starts unassigned and that view would open empty |
| Making corporate landlords visible changes result sets | New param defaults to current behavior; only the CRM opts in |
| Two visual languages in one app | Accepted deliberately — corporate tab, dark CRM |

## Out of Scope

**Phase 2 — activity and scheduling:** tasks, reminders, appointments, call/text/
email logs, notes timeline, follow-up sequences, calendar.

**Phase 3 — power tools:** saved filters, tagging, bulk actions, CSV export,
reporting, cross-field search over name, entity, phone, email, property address,
mailing address, and case number.
