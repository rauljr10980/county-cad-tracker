# Corporate CRM Port — Design

**Date:** 2026-08-24
**Status:** Approved for planning

## Context

Two eviction CRMs exist:

- **`county-cad-tracker`** (this repo) — Vite SPA, Express, Prisma, PostgreSQL on
  Railway. Carries the property, pre-foreclosure, foreclosure, driving and
  calendar work, and a working eviction list. This is the infrastructure being
  kept.
- **`C:\Users\Raulm\Private CRM Evictions`** — Next.js 15, Drizzle, Better Auth.
  Deployed as the `crm` service in the *Private my 360 portfolio* Railway
  project alongside a `public-site`. Not in GitHub; it exists only on that
  machine and on Railway. Newer, and its owner-research workflow is materially
  better.

The decision is to keep this repo's infrastructure and bring across the other
project's **design language** and its **owner-research and contact-tracking
workflow**.

Nothing is copied as code. The stacks share no runtime: Next.js App Router
server components and Drizzle on one side, a Vite SPA calling Express and Prisma
on the other. Everything is reimplemented against this stack.

## Decisions

| Question | Decision |
| --- | --- |
| Which infrastructure | This repo's. Express, Prisma, Railway, existing deploy. |
| Which design | The other project's corporate system, applied app-wide. |
| Which screens keep their logic | Calendar, Properties, Pre-Foreclosure, Driving 4$ — appearance only. |
| Which screens are rebuilt | Eviction list and property/owner detail. |
| Migration approach | Reimplement. No Next.js code is ported. |

## Two bugs this fixes

Both are live in `src/crm/views/EvictionLeadsView.tsx:136-139`, and both were
already solved in the other project.

**1. Names are searched surname-first and return nothing.**

The eviction workbook records plaintiffs as `SANCHEZ, GERARDO, JR`. That string
is passed unmodified into the TruePeopleSearch `name` parameter. The site reads
the leading token as a first name, so it searches for a person called *Sanchez
Gerardo Jr* and finds no one.

The other project's `toSearchableName()` flips it — `ROMO, LOWAH` becomes
`LOWAH ROMO`, and suffixes stay at the end, so `SANCHEZ, GERARDO, JR` becomes
`GERARDO SANCHEZ JR`. Its own comment calls this "the difference between no
results and the right person."

**2. A full street address is passed as the locality.**

`location` is built as `${a.address}, ${a.city}, ${a.state} ${a.zip}` and passed
as `citystatezip`, a parameter that expects only `TX 78201`. The other project's
`splitMailingAddress()` parses a composed address into a search term and a
locality with a regex, falling back to a county default.

Person-lookup from the eviction screen has therefore never worked correctly.
The address-lookup path is unaffected.

## Architecture

### 1. Design token layer

A single token layer expressing the other project's system, documented there as:

> Light, institutional, hairline-ruled. Navy carries authority, a single muted
> gold marks what needs attention today, and everything else is greyscale so
> colour never competes with the data. Monospace stays reserved for record
> values — addresses, dates, counts.

| Token | Value | Role |
| --- | --- | --- |
| `ground` | `#eef1f4` | Page background |
| `surface` / `surface-alt` | `#ffffff` / `#f7f9fb` | Cards, sunken rows |
| `line` / `line-strong` | `#e0e5eb` / `#c7cfd9` | Hairline rules |
| `navy` / `navy-mid` / `navy-soft` | `#13293f` / `#1e3d5c` / `#35536f` | Rail, authority |
| `ink` / `ink-dim` / `ink-faint` | `#10202f` / `#55636f` / `#8a95a1` | Text hierarchy |
| `gold` / `gold-soft` | `#9a6f1c` / `#f0e5cd` | Needs attention today |
| `brick` / `brick-soft` | `#a8352b` / `#f6e2e0` | Destructive, dead ends |
| `mgmt` / `lending` / `listing` / `acq` | `#1f6b52` / `#245f9e` / `#a4543a` / `#574a86` | Service interest |

Type is Franklin for display and IBM Plex Mono for record values. The
`.label` micro-label — 10px, `0.13em` tracking, uppercase, `ink-faint` — carries
the institutional voice and is used for every field label.

This repo's Tailwind reads colors as `hsl(var(--token))`, so the port defines
these as HSL triples in `src/index.css` and the existing semantic classes pick
them up. That is the same mechanism the `.urg-crm` theme already uses.

**The existing `.urg` corporate theme is retired.** It was derived from the
Apartment Locating app and is a different, competing corporate look. Keeping
both would leave three visual languages in one product.

### 2. Application shell

The top tab bar is replaced by a **76px navy icon rail**, fixed while content
scrolls. Nav items carry an inline SVG glyph and a label. This is the structural
change that makes the app read as the other product.

All eight tabs remain reachable. `HIDDEN_TABS` stays as the mechanism for
trimming the rail.

### 3. Research module

A new `src/lib/research-links.ts`, reimplementing:

- `ACT_TAX_URL`, `BEXAR_CAD_URL` — Bexar tax collector and appraisal district
- `toSearchableName(name)` — surname-first to searchable, suffixes preserved
- `splitMailingAddress(mailing)` — composed address to `{ query, cityStateZip }`
- `addressLookupUrl(...)`, `personLookupUrl(...)` — the two TPS entry points

Pure functions, no fetching. The module comment in the source states the
constraint plainly and it carries over: people-search sites block automated
access, and a blocked server IP breaks the manual flow from the same network,
so the app only ever assembles a URL for the agent's own browser to open.

### 4. Contact model

Today contacts are a JSON blob on `eviction_landlords`:
`{ phoneRows: [...], emailRows: [...] }`. That cannot carry per-number state,
because there is nowhere to record when a specific number was last called.

A new table, `eviction_contact_points`:

| Column | Purpose |
| --- | --- |
| `landlordId` | Owner |
| `kind` | `phone` \| `email` |
| `value` | As displayed |
| `normalizedKey` | Last 10 digits, or lowercased email — the dedupe key |
| `personName` | Whose number it is — owner, spouse, relative |
| `source` | `court_file` \| `research` \| `website` \| `manual` |
| `outcome` | Last call result, from the fixed taxonomy |
| `attempts` | Count, against a goal of 4 |
| `lastCalledAt` | Drives the "2h ago" relative display |

Source is styled distinctly because, as the other project puts it, *"a number the
court gave us and one an agent earned are not the same thing."*

Outcomes are a fixed list: confirmed, left voicemail, no answer, bad number,
wrong person, do not contact.

**Migration:** existing `contacts` JSON is read and expanded into rows, mapping
the existing `source: 'Court file'` / `'TruePeopleSearch'` strings onto
`court_file` / `research`. The JSON column is left in place and unread, so the
migration is reversible by reverting code alone.

### 5. Server-side parsing

Parsing moves from the browser to `POST /api/evictions/landlords/:id/contacts`,
which parses the pasted text, dedupes against existing rows, inserts, and
returns `{ added, skipped, name }`. The screen reports "added 3, skipped 2"
rather than silently absorbing a paste.

`extractContacts()` stays as the parser — it is already correct and already
tested. It moves to the backend, where the existing frontend copy continues to
serve the Property and Pre-Foreclosure modals until those are converted.

## Phasing

Each phase lands working and deployable on its own.

1. **Design tokens and shell** — token layer, navy rail, `.label` treatment,
   applied across all screens. No behavior changes.
2. **Research module** — `research-links.ts` plus the two bug fixes, wired into
   the eviction screen and the property modals.
3. **Contact tracking** — the table, migration, server-side parse endpoint, and
   the rebuilt research panel with attempts, outcomes, and provenance.
4. **Screen rebuilds** — eviction list and property/owner detail on the new
   design and the new contact model.

## Testing

Vitest is already established here, with 24 tests passing.

- `toSearchableName` — surname-first, suffixes, already-correct names,
  single-token names, empty input
- `splitMailingAddress` — full address, missing zip, missing state, empty
- URL builders — encoding of names containing commas and addresses containing `#`
- Contact migration — JSON shapes expand to the right rows, source strings map
  correctly, dedupe holds across both representations

The design port is verified by screenshot against the other CRM, not by test.

## Risks

| Risk | Mitigation |
| --- | --- |
| The shell change touches every screen | Phase 1 changes appearance only; each screen is checked in a browser before merge |
| Contact migration is destructive in effect | JSON column is retained and unread, so reverting code restores the old behavior |
| Three visual languages during the transition | `.urg` is retired in phase 1 rather than left alongside |
| Franklin may not be available | Confirm licensing/availability during phase 1; fall back to a close grotesque and record the substitution |

## Out of scope

The public marketing site, Better Auth, Drizzle, and anything from the Next.js
side as code. The other project's Merge/duplicates and Imports screens. Any
change to the Railway deployment topology.
