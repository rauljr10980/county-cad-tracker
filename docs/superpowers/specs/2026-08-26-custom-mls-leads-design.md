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

**`mlsOwnerName` and `cadOwnerName`, not `seller` and `buyer`.** The `Owner`
column is the owner at listing time. On a sold row that is the seller; on the
1,571 rows that did not sell it is simply the current owner. Naming the field
`sellerName` would be wrong on two-thirds of the data. On a sold row the two
fields are seller and buyer; on a live or expired row they should agree, and a
disagreement is a title change the MLS did not report — a signal worth seeing
rather than a bug.

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
- **Owner from the file:** `mlsOwnerName`, `mlsOwnerKind`
- **Owner from CAD:** `cadOwnerName`, `cadOwnerAddress`, `cadLookupAt`,
  `cadLookupStatus`
- **Contact:** `phoneNumbers[]`, `emails[]`
- **Working fields:** `workflowStage`, `notes`, `nextFollowUpDate`
- `createdAt`, `updatedAt`

`userId` is nullable in the schema for the same reason as the CRM design:
Railway runs `prisma db push --accept-data-loss`, and a required column with no
default fails against a populated table. It is always set in application code.

`price` is `LP/SP` — list price on active rows, sale price on sold ones. Stored
once and interpreted by status; the UI labels it accordingly rather than
pretending it means one thing.

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
county, unit count, and price. Columns cover address, status, units, price,
`mlsOwnerName` with its kind, `cadOwnerName`, and lookup status.

Each property carries a deed-search link opening
`bexar.tx.publicsearch.us` prefilled with the address — the pattern already used
at `src/components/preforeclosure/FullDetailsModal.tsx:359` — so the chain of
title can be checked by hand where the automated lookup does not reach.

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

## Risks

**The `Owner` heuristic will misclassify.** A person named "Trust" or a company
without a suffix lands in the wrong bucket. Misclassification only affects
whether a row is offered for calling, and `mlsOwnerKind` is stored so a bad
rule can be re-run over existing rows rather than needing a re-import.

**Scraper fragility.** `ownerLookup.js` drives a headless browser against a
county site that can change without notice. It already has this exposure through
Pre-Foreclosure; this feature increases the volume, not the risk class.

**83% coverage is not 100%.** 384 rows are in counties this cannot look up.
They are imported and visible, with the seller name the file provides, and
marked as unsupported rather than silently skipped.
