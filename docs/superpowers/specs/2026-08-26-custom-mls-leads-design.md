# Custom MLS Leads

**Date:** 2026-08-26
**Status:** Approved for planning

## Goal

Turn connectMLS multifamily exports into a worked lead list. Import the
listings, keep the owner the MLS names, and — on properties that sold — look up
who owns them now. A sold property yields two people worth calling: the one who
just sold, and the one who just bought. Both are asked the same question, does
he want to buy or sell more.

## Source data

Four exports in `Multfifamily data MLS/`, all sharing one 30-column layout:

```
MLS# | Status | Area | Address | LP/SP | DOM | Ttl Units | SqFt | Yr Blt | Type
Bldr Name | Constrctn | County | CountAct# | County Tax | Legal Desc | LglDsc-Lot
List Agent | List Agent Ph. | Owner | LREA/LREB | Selling Agent | Selling Agent Ph.
State | Dir | Street Name | Str # | TaxPropID | Zip | ZipPlus
```

2,471 rows, **2,321 unique** by `MLS#` — 150 listings appear in more than one
export. County split is 1,937 Bexar (83%), then Comal 164, Guadalupe 107,
Medina 84, Bandera 38, Kendall 33, Wilson 23, Hays 9, Atascosa 5, Blanco 2.

Status mix (deduped, sums to 2,321): SLD 750, CAN 554, EXP 475, ACT 366,
WDN 53, PCH 41, NEW 37, PND 22, AO 13, BOM 8, CS 1, PDB 1.

The portfolio is small multifamily: 1,469 duplexes, 425 fourplexes, 228
triplexes.

### The `Owner` column is dirty

Populated on every row, but agent-typed free text:

| kind | count | share |
| --- | --- | --- |
| person name | 1,275 | 54.9% |
| entity (LLC / LP / Trust) | 753 | 32.4% |
| junk — "See Offer Instructions", "yep", "see agent", "N/A" | 173 | 7.5% |
| an address, not a name — "804 Station Street" | 115 | 5.0% |
| blank | 5 | 0.2% |

87% usable. Individual names are surname-first: `Baugher Jason E`,
`Harrison Phillip L`.

### What each slice yields

- **Failed listings** (EXP/CAN/WDN): 1,082, of which 943 have a usable owner
  name and 785 are in Bexar. The owner listed, failed to sell, still owns the
  property — callable with no lookup at all.
- **Sold**: 750, of which 654 are in Bexar and 668 already name the seller.
  **579 have both** — a named seller in the file and a Bexar address the current
  owner can be looked up from.

`CountAct#` is filled on only 852 of 1,937 Bexar rows (44%), so most Bexar
lookups fall back to address search. That costs nothing:
`lookupBexarTaxAssessor` types the street address into the search box and does
not use the account number.

## Scope

A new `Custom MLS Leads` tab: import, a filterable working list, owner
classification, and Bexar owner lookup prioritised to sold rows.

**Out of scope**, each its own feature: appraisal-district scrapers for the
other nine counties, TX Secretary of State lookup for the 753 entity owners,
and mapping or geocoding these properties.

## Decisions

**Contacts carry a `role` — `mls_owner` or `cad_owner` — not `seller` and
`buyer`.** The `Owner` column is the owner at listing time. On a sold row that
is the seller; on the 1,571 rows that did not sell it is simply the current
owner. A field named `sellerName` would be wrong on two-thirds of the data. The
role says where the name came from, which is always true; whether that makes the
person a seller is a question of the property's status. On a live or expired row
the two roles should name the same person, and a disagreement is a title change
the MLS did not report — a signal worth seeing rather than a bug.

Names live only on `MlsContact`. The lead keeps lookup metadata
(`cadLookupAt`, `cadLookupStatus`) because whether a lookup ran is a fact about
the property, not about a person.

**Per-user from day one, keyed `@@unique([userId, mlsNumber])`.**
`PreForeclosure` makes `documentNumber` globally unique; that is wrong here.
Two accounts importing the same export must each own their copy, so uniqueness
is composite. This uses the same ownership pattern as
`2026-08-26-per-user-crm-isolation-design.md`, but does not depend on that work
landing.

**Status transitions are recorded, not overwritten.** A re-import that moves a
row from `ACT` to `SLD` is the buy signal — a property that just changed hands
and has a new owner to look up. Overwriting `status` in place destroys exactly
the event the feature exists to catch.

**Owner classification is a pure function in its own module**, unit-testable
without a database, following `functions/src/lib/pipelineQueues.js` — which was
extracted for exactly this reason after `new PrismaClient()` proved to make the
routes unimportable in the test environment.

## Data model

New model `MlsLead`:

- **Identity:** `userId`, `mlsNumber`, `@@unique([userId, mlsNumber])`,
  `@@index([userId])`
- **Status:** `status`, `previousStatus`, `statusChangedAt`
- **Location:** `address`, `streetNumber`, `streetDir`, `streetName`, `zip`,
  `county`, `state`, `areaCode`
- **Property:** `price`, `daysOnMarket`, `totalUnits`, `squareFeet`,
  `yearBuilt`, `propertyType`, `construction`, `builderName`
- **County records:** `legalDescription`, `countyAccountNumber`, `taxPropId`
- **Agents:** `listAgent`, `listAgentPhone`, `sellingAgent`, `sellingAgentPhone`
- **Raw owner:** `mlsOwnerRaw` — the `Owner` cell exactly as imported, kept
  even when it classifies as junk, so a corrected classifier can be re-run
  without re-importing
- **Lookup metadata:** `cadLookupAt`, `cadLookupStatus`
- **Working fields:** `notes`
- `createdAt`, `updatedAt`

Contact details and workflow state do not live here — see Contacts below.

`userId` is nullable in the schema for the same reason as the CRM design:
Railway runs `prisma db push --accept-data-loss`, and a required column with no
default fails against a populated table. It is always set in application code.

`price` is `LP/SP` — list price on active rows, sale price on sold ones. Stored
once and interpreted by status; the UI labels it accordingly rather than
pretending it means one thing.

## Contacts

A sold property has two people worth calling: the seller the file names and the
buyer the lookup returns. A single `workflowStage` on the property cannot record
"called the seller, have not called the buyer" — and that distinction is the
whole point of the feature. Skip tracing, calling, and following up all happen
against a person, not a parcel.

So contact state lives in a child model, `MlsContact`:

- `mlsLeadId`, `role` — `mls_owner` or `cad_owner`
- `name`, `nameKind` (the classification), `searchName` (normalised)
- `mailingAddress`, `phoneNumbers[]`, `emails[]`
- `workflowStage`, `workflowLog`, `notes`
- `@@unique([mlsLeadId, role])`, `onDelete: Cascade`

A property has one contact on import (`mls_owner`) and gains a second when a
lookup returns a different current owner. On a sold row those are seller and
buyer. Where the two names agree, no second contact is created — there is one
person to call, not two records of them.

Only `person` and `entity` contacts are created. A `junk`, `addressLike`, or
`blank` owner produces no contact, which is what keeps the 173 `"see agent"`
rows out of the call list without discarding the listing itself.

## Workflow

The existing `WORKFLOW_STAGES` machine in `src/types/property.ts` is reused as a
*mechanism* — a stage with a question, outcomes that name the next stage, an
appended `WorkflowLogEntry` per transition, and a task auto-created on entering
certain stages — but not as a *vocabulary*. Its twelve stages describe distressed
door-knocking: `initial_visit`, `visit_heirs`, `call_heirs`, `land_records`.
None of that happens here. Reusing those labels would leave every MLS lead
sitting in stages that describe work nobody is doing.

MLS contacts get their own stage set, on the same engine:

| stage | question | outcomes |
| --- | --- | --- |
| `not_started` | — | Begin → `needs_skip_trace` |
| `needs_skip_trace` | Did you find a number? | Found → `ready_to_call`; Nothing → `dead` |
| `ready_to_call` | — | Call made → `attempted` |
| `attempted` | Did they pick up? | Spoke → `spoke`; No answer → `attempted`; Give up → `dead` |
| `spoke` | What do they want? | Sell → `negotiating`; Buy more → `buyer_interest`; Not now → `nurture`; No → `dead` |
| `nurture` | — | Ready now → `spoke`; Done → `dead` |
| `buyer_interest` | — | Has inventory → `negotiating`; Done → `dead` |
| `negotiating` | — | Offer sent → `sent_offer`; Fell through → `dead` |
| `sent_offer` | Accepted? | Yes → `closed` (terminal, success); No → `dead` |
| `closed` | — | terminal, success |
| `dead` | — | terminal, failure |

A contact whose `nameKind` is `entity` starts at `needs_skip_trace` like any
other, but is flagged in the UI as not directly traceable — reaching it needs the
CAD mailing address or a registered-agent search, which is out of scope.

Entering `ready_to_call` or `attempted` auto-creates a call task, mirroring
`STAGE_TASK_MAP`. Entering `nurture` schedules a follow-up rather than a task.

## Follow-ups

`FollowUp` is already polymorphic across `propertyId`, `preforeclosureId`, and
`drivingLeadId`. Add `mlsLeadId` with the same nullable-FK-plus-cascade shape and
an index. Follow-ups attach at the property level, matching the existing three;
the note names which contact it concerns.

Three call sites must be extended or MLS follow-ups will be created and then
silently fail to appear:

- `functions/src/routes/followups.js` — `GET /` must include the MLS relation the
  way it includes the other three, or the records come back without the data the
  calendar needs to label them
- `src/components/calendar/CalendarView.tsx:115-117` — label resolution checks
  `fu.drivingLead`, `fu.property`, `fu.preForeclosure` in turn and falls through
  to a generic string; without an MLS branch these render unlabelled
- `src/components/calendar/CalendarView.tsx:159` — `kind` is derived from
  `fu.drivingLeadId`, so MLS follow-ups need to resolve to a sensible kind rather
  than defaulting

This is the part most likely to be declared done while broken: creating the
follow-up works, and the failure only shows up on the calendar screen.

## Property details

Each property opens a details view covering, in tabbed sections:

- **Property** — address, county, status with its transition history, units,
  square feet, year built, type, construction, price interpreted by status, days
  on market, legal description, and the county account and tax IDs
- **Contacts** — one panel per `MlsContact` with name and kind, phones, emails,
  mailing address, current stage, and the stage control that drives the workflow
- **Activity** — the merged `workflowLog` across contacts and the follow-up
  history, newest first
- **Research** — the prefilled `bexar.tx.publicsearch.us` deed link, a
  people-search link built from `searchName`, and the lookup status with its
  timestamp

`src/components/preforeclosure/FullDetailsModal.tsx` is the closest existing
analogue and should be read for its patterns — particularly the deed link at
line 359 — but not copied. It is 1,486 lines in a single file. Build this as
one component per tab so each stays reviewable, and so a change to the contacts
panel cannot break the property panel.

## Owner classification

A pure function over the raw `Owner` string returning one of `person`,
`entity`, `junk`, `addressLike`, `blank`:

- `blank` — under three characters after trimming
- `junk` — matches an instruction phrase (`see …`, `private owner`, `yep`,
  `n/a`, `unknown`, `tbd`, bare punctuation)
- `addressLike` — contains a digit
- `entity` — contains `LLC`, `L.L.C`, `LP`, `INC`, `TRUST`, `PROPERTIES`,
  `CORP`, `HOLDINGS`, `LTD`, `INVESTMENTS`, `PARTNERS`
- `person` — everything else

Order matters: `junk` is tested before `addressLike`, so `"See 123 Main"`
classifies as junk rather than as an address.

Only `person` and `entity` rows enter the call list. `entity` rows are shown but
flagged as not directly skip-traceable — reaching them needs the CAD mailing
address or a registered-agent search, which is out of scope.

## Name normalisation

Individual owner names arrive surname-first (`Baugher Jason E`). A shared
module converts them to search order (`Jason Baugher`) for people-search links.

This is the same defect as `toSearchableName` in
`src/crm/views/EvictionLeadsView.tsx`, which is known-wrong and still unfixed.
Write it correctly here, in a module both can use, rather than producing a third
implementation. Migrating the eviction call site is not required by this
feature, but the module should be usable by it.

## Import

Multi-file `.XLS` upload parsed with the `xlsx` dependency already in the repo.

1. Parse each sheet; the layout is identical across files, so one parser serves
   all four.
2. Dedupe on `MLS#` within and across files — first occurrence wins.
3. Upsert on `(userId, mlsNumber)`.
4. On an existing row whose status differs, set `previousStatus` to the stored
   value and `statusChangedAt` to now before writing the new status.

Batch the writes. The eviction importer's original failure is the precedent to
avoid: 294 sequential `$transaction` calls against a 5-second default timeout
never completed on a 44,070-row workbook, and was fixed with batched
`createMany`. 2,321 rows is far smaller, but the same shape of mistake is
available.

## CAD lookup

Reuse `functions/src/lib/ownerLookup.js` unchanged. It searches the Bexar tax
assessor by street address, returns owner name and mailing address, then
optionally runs TruePeopleSearch for phones.

Run as a batch job over rows needing lookup, ordered:

1. `status = 'SLD'` and `county = 'Bexar'` — 654 rows, the two-sided leads
2. remaining Bexar rows
3. non-Bexar rows are not attempted; they are marked
   `cadLookupStatus = 'unsupported_county'`

An explicit `unsupported_county` state matters: without it 384 rows sit at
`pending` forever and look like a stuck queue rather than a known limit.

## UI

A `Custom MLS Leads` entry in the nav rail, scoped to the signed-in user.

The working list is a table filterable by status group (sold / failed / active),
county, unit count, price, and contact stage. Columns cover address, status,
units, price, the contact names with their kinds, lookup status, and next
follow-up date. Opening a row opens the property details view above.

A lead's row shows the furthest-along stage across its contacts, so a property
where the seller is dead but the buyer is negotiating reads as negotiating
rather than dead.

## Testing

Backend tests under `functions/src/**/*.test.js`, which the existing Vitest
config already collects:

- owner classification returns the right kind for each of the five categories,
  including that `junk` beats `addressLike`
- name normalisation converts surname-first to search order, and leaves
  already-normal names and entity names untouched
- the parser maps all 30 columns, and tolerates the nulls seen in real data
  (`CountAct#`, `TaxPropID`, `ZipPlus`)
- dedupe keeps the first occurrence of a repeated `MLS#`
- a status change sets `previousStatus` and `statusChangedAt`; an unchanged
  status leaves both alone
- lookup ordering puts sold-in-Bexar first, and non-Bexar rows get
  `unsupported_county` rather than being attempted
- contacts are created for `person` and `entity` owners and not for `junk`,
  `addressLike`, or `blank`
- a lookup returning the same name as the file creates no second contact; a
  different name creates the `cad_owner` contact
- every workflow stage's outcomes name a stage that exists, every non-terminal
  stage has at least one outcome, and both terminal stages have none — a
  transition table is worth nothing if an outcome can point at a typo
- a stage transition appends a `WorkflowLogEntry` recording both the old and new
  stage, and does not overwrite earlier entries
- the list's row stage is the furthest-along across a property's contacts

Frontend tests with Vitest and React Testing Library, matching the existing
convention that `@testing-library/jest-dom` is not installed:

- a follow-up created against an MLS lead renders on the calendar with the
  property's address as its label, not a generic fallback — the specific failure
  the follow-up call sites invite

## Risks

**The `Owner` heuristic will misclassify.** A person named "Trust" or a company
without a suffix lands in the wrong bucket. Misclassification decides whether a
contact is created at all, so a row wrongly called junk disappears from the call
list entirely — the failure is silent. `mlsOwnerRaw` is retained on the lead for
exactly this case: a corrected classifier can be re-run across stored rows and
create the contacts it should have created, without re-importing the files.

**Scraper fragility.** `ownerLookup.js` drives a headless browser against a
county site that can change without notice. It already has this exposure through
Pre-Foreclosure; this feature increases the volume, not the risk class.

**83% coverage is not 100%.** 384 rows are in counties this cannot look up.
They are imported and visible, with the seller name the file provides, and
marked as unsupported rather than silently skipped.
