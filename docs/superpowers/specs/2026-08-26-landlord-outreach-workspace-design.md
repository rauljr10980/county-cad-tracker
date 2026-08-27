# Landlord Outreach Workspace

**Date:** 2026-08-26
**Status:** Approved for planning

## Goal

Turn the landlord profile from a contact dump into the screen a call is made
from. Every phone line carries its own note, its own attempt count, and whether
it turned out to be the right person. Emails get their own section. Properties
the landlord mentions owning are recorded as they are mentioned, and the
research links point at an address rather than a name.

## Why

Today the profile lists phone numbers as flat text. Nothing records that the
first number was tried, that it was answered by someone who said they own no
rentals, or that the area code looked wrong for the person being sought. That
knowledge currently lives in one shared free-text notes box for the whole
landlord, where it cannot be attached to the line it describes.

The addresses on a landlord are the mailing addresses their checks go to, not
the rentals they own. When a landlord names a property on a call there is
nowhere to put it.

## Scope

The eviction landlord profile in `src/crm/views/EvictionLeadsView.tsx` and the
backend that serves it.

**Out of scope**, each its own feature: looking owned properties up from the
county rather than typing them, geocoding owned properties onto the map, and
migrating the eviction list's name handling beyond what the research links need.

## Decisions

**Phone disposition reuses the existing `status` field.** `Phone` is already
`{ number, status, source }` and `status` is written as `''` on extraction and
never read. It becomes the disposition rather than adding a second field beside
a dead one.

**Attempts are an uncapped running count.** No retirement rule, no `n of 4`.
The count is information, not a workflow gate.

**Pressing a number writes an `EvictionActivity` of kind `call`.** The existing
`addActivity` path already sets `lastContactedAt` and advances `New Lead` to
`Contacted`; call logging joins that machine rather than running beside it. A
second source of truth for "when did we last talk to this landlord" would drift
from the one the pipeline queues already read.

**Disposition is a separate action from placing the call.** You do not know
whether it was the right person until they answer, so the button that dials
cannot also record the outcome.

**Owned properties are a table, not a JSON field.** `EvictionOwnedProperty`
rather than an `ownedProperties` blob on the landlord, even though `contacts`
next to it is JSON. Addresses in this repo are already relational and geocoded
(`EvictionAddress`), so these can join that treatment later without a data
migration, and a `PROPERTIES` count in the list view becomes a join instead of
parsing JSON for every row.

**Research links act on an address, not the landlord.** A landlord can have
several addresses and the useful search is per-address, so the buttons live on
each address rather than once at the top of the profile.

## Data model

### `Phone` (inside the `contacts` JSON on `EvictionLandlord`)

Existing: `number`, `status`, `type`, `source` — all optional but `number`.
`type` is also unread today; it is left alone rather than repurposed, since
"mobile / landline" is a plausible future use and disposition already has a
home.

Added:
- `note` — free text for this line
- `attempts` — integer, defaults to 0
- `lastAttemptAt` — ISO timestamp or null

`status` now holds `'right'`, `'wrong'`, or `''` for undecided.

### `EmailRow` (inside the same JSON)

Currently `{ name, emails: string[] }`. Becomes
`{ name, emails: { address: string, note?: string }[] }` so an email line can
carry a note the way a phone line does.

**This shape change must be read-tolerant.** Existing rows hold bare strings;
the reader normalises a string to `{ address }` on load rather than requiring a
migration of the JSON column.

### `EvictionOwnedProperty` (new)

- `id`, `landlordId` (cascade delete)
- `address`, `city`, `state`, `zip`
- `notes`
- `createdAt`
- `@@index([landlordId])`

## Call logging

Pressing a phone line:

1. opens `tel:<number>`
2. increments that line's `attempts` and sets `lastAttemptAt`
3. posts an `EvictionActivity` with `kind: 'call'`, which sets the landlord's
   `lastContactedAt` and advances `New Lead` to `Contacted`

The attempt count renders next to the line. Right and wrong are two separate
controls that set `status`, available at any time and reversible — a number
marked wrong by mistake must be correctable.

A number whose `status` is `wrong` renders de-emphasised but is not hidden.
Hiding it invites re-adding the same number from a later extraction.

## Research links

Three buttons per address.

**TruePeopleSearch — by address.** The current link is wrong twice: it searches
by name, and it passes the entire street address as `citystatezip`:

```js
`...?name=${selected.name}&citystatezip=${a.address}, ${a.city}, ${a.state} ${a.zip}`
```

It becomes an address search, with the street line and the locality in their own
parameters — `streetaddress` taking `address`, and `citystatezip` taking
`City, ST ZIP`.

**Tax Assessor** — `bexar.acttax.com`, the pattern already used at
`src/components/preforeclosure/FullDetailsModal.tsx:331`.

**Land Records** — `bexar.tx.publicsearch.us`, prefilled from the street name,
the pattern already used at the same file's line 359.

Landlord names are stored surname-first (`MARTINEZ, PETRA`). Address search
avoids the problem; any future name-based lookup must flip the name first. The
existing `toSearchableName` in this file has that defect and is not corrected
here — it is not on the path this feature takes.

## UI

The profile's Contacts card splits into two sections.

**Phones** — one row per number showing the number as the dial control, the
attempt count, right/wrong controls with the current disposition indicated, the
source, and a note field.

**Emails** — its own section, one row per address with a note field. Emails are
rendered today, but inside the same Contacts list as the phone numbers
(`EvictionLeadsView.tsx:289`), which is what makes a phone line and an email
line indistinguishable at a glance.

**Properties owned** — a card listing recorded properties with their notes, and
a form to add one. Empty state says none have been recorded rather than
rendering an empty box.

The leads table gains a `PROPERTIES` column showing the count per landlord,
following the existing `.record` convention for numeric values.

## Testing

- phone attempt increment produces the right count and timestamp, and leaves
  other lines untouched
- setting disposition to `right` then `wrong` ends at `wrong`, and clearing
  returns to undecided
- the email reader normalises a bare string to `{ address }`, so a landlord
  saved before this change still renders
- the TruePeopleSearch URL puts the street line in `streetaddress` and only
  `City, ST ZIP` in `citystatezip` — the specific bug being fixed
- tax assessor and land records URLs are built from the address they belong to
- a landlord with no owned properties renders the empty state, not a blank card

URL building and the contacts normaliser are pure functions and belong in their
own module, unit tested without a DOM — the `pipelineQueues.js` precedent.

## Risks

**The `contacts` JSON has no schema enforcement.** A reader that assumes the new
shape will throw on old rows. The normaliser is the single entry point that
prevents this, and every read must go through it.

**`tel:` links do nothing useful on a desktop without a handler.** The attempt
still logs, which is the part that matters; the dial is best-effort.
