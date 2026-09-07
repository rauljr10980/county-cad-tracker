# Business Card Scanner

**Date:** 2026-09-07
**Status:** Approved for planning

**Supersedes:** `docs/superpowers/specs/2026-09-05-scan-business-card-design.md`
and the plan on branch `feat/scan-business-card`
(`docs/superpowers/plans/2026-09-05-scan-business-card.md`) — neither was
ever implemented (spec + plan only, no code). This document replaces that
design outright rather than amending it: the scanning mechanism changes
from a single photo capture uploaded to Google Cloud Vision, to a
continuous live camera feed processed entirely on-device. That earlier
branch should be treated as stale.

## Goal

A "Scan Business Card" action in the CRM's Contacts view that behaves like
a QR-code scanner: point the live camera at a card, it detects the card
and reads it automatically, no shutter button, no photo ever saved. Review
and correct the extracted fields, then save to the CRM.

## Why

Manually typing a business card into the CRM is the friction that stops it
happening after a networking event. The earlier design already established
this; what changed is the interaction model the user actually wants — a
live, continuous scan that feels instant, not a capture-then-upload flow.

## Scope

The CRM tab's `Lead` model (`kind: 'industry'`) and its existing sync path.
Not the Evictions CRM, not MLS leads.

## Decisions

**Fully local — no network call for scanning, at all.** The camera feed,
the live detection, and the final text extraction all run in the browser
via Tesseract.js (WASM). The backend is never involved until the user taps
"Save Contact," at which point it's the same `addLead()`/`updateLead()`
path a manually-typed contact already uses. This was chosen over two
alternatives after discussion: cloud-only polling (would burn many Vision
API calls per scan while hunting for the right angle, and feels laggy) and
a hybrid local-trigger-plus-one-cloud-call approach (better OCR accuracy,
but adds a network dependency and a per-scan cost the user explicitly
didn't want). The accepted tradeoff: Tesseract.js is less accurate than
Google Vision on stylized fonts and logos, which the review screen exists
to absorb — same mitigation principle as the original design, just leaning
on it more.

**Two-pass local extraction, not one.** The live polling loop (see below)
runs a fast, low-resolution OCR pass purely to detect *that* a card is
present — it is not the pass that produces the saved data. The instant it
detects enough signal, the loop stops and one more OCR pass runs against a
freshly captured, full-resolution frame — this is the pass whose text
actually gets parsed into fields. Reusing the noisy detection-frame's text
directly would mean the fastest, least accurate pass is also the only one
that matters; a second confirmation pass on a clean frame costs a few
hundred milliseconds and meaningfully improves what actually gets shown on
the review screen.

**The detection trigger and the field parser share one signal-detection
module.** Both "is there a business card in view" and "extract the
fields" need to recognize an email or phone shape in raw text. Rather than
two subtly different regexes drifting apart, the email/phone patterns are
defined once and used by both the cheap trigger check and the full parser.

**Reuse existing `Lead` fields wherever they already mean the right
thing, rather than introducing new ones.** Checked against the current
schema (`src/crm/data/types.ts`) and `LeadForm.tsx`'s current rendering:

- Name → `ownerName`. The parser identifies first and last name
  separately internally (useful for correctly ordering/capitalizing a
  misread name), then joins them into this one existing field before
  the review screen ever sees it — matching how every other contact's
  name already works. No two-box name editor introduced just for
  scanned contacts.
- Company → `firm` (the CRM's existing "company" concept; editing it
  already keeps `businessName` in sync via `LeadForm.tsx`'s current
  `onChange` handler and submit-time fallback logic — nothing new
  needed here).
- Job Title → `jobTitleIndustry` (existing field).
- Phone → `phone`, Email → `email`, City → `city` (existing fields).

Only genuinely new fields: `secondaryPhone`, `website`, `streetAddress`,
`state`, `zip`, `linkedIn`, `relationshipType`. Plus `'Business Card'`
added to the existing `Source` enum.

**No `addedBy` field.** Confirmed with the user: this CRM is single-user
per account, contacts are never shared across users, so "who added this"
is already fully answered by the existing per-account ownership — a
second field for the same fact would just be a place for the two to
disagree.

**`relationshipType` is always user-confirmed, never silently trusted from
the image** — same principle as the original design, now with the user's
12-option list: Property Owner, Investor, Broker, Real Estate Agent,
Lender, Property Manager, Developer, Contractor, Vendor, Attorney, CPA,
Other. Defaults to unselected.

**Duplicate detection keeps its original three-tier order** (email exact →
phone last-10-digits → name + company both matching), but the resulting
dialog now has three actions instead of two: **Update Existing**, **Create
New**, and **Cancel** (discards the scanned data, returns to the live
camera to try again — it does not close the whole scanner).

## Data model

Add to `Lead` (`src/crm/data/types.ts`):

- `secondaryPhone String` (default `""`)
- `website String` (default `""`)
- `streetAddress String` (default `""`)
- `state String` (default `""`)
- `zip String` (default `""`)
- `linkedIn String` (default `""`)
- `relationshipType String` (default `""`) — one of the 12 options above,
  or empty for "not set."

Add `'Business Card'` to the existing `Source` union.

Mirror the same 7 fields on `CrmLead` (`functions/prisma/schema.prisma`) —
the whole-state sync (`PUT /api/crm/state`) already round-trips every
`Lead` field explicitly; these need to be added to that mapping the same
way, or they'll be silently dropped on the next sync round-trip even
though `addLead()` builds them correctly client-side.

`NewLeadInput` (`Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt' |
'kind'>`) inherits the 7 new fields automatically once `Lead` has them.

## The scanning mechanism

1. **Open.** "Scan Business Card" (in `ContactsView.tsx`, which currently
   has no add-contact trigger of any kind) opens a full-screen camera
   view. `navigator.mediaDevices.getUserMedia({ video: { facingMode:
   'environment' } })` streams into a live `<video>` element — this is a
   new camera-access pattern for this codebase; the existing precedent
   (`DrivingView.tsx`'s `<input type="file" capture="environment">`) is
   single-shot photo capture, not a live feed, and doesn't apply here. A
   rectangular guide overlay shows where to position the card.
2. **Lazy-load Tesseract.js** only when the button is clicked (dynamic
   `import()`), so the WASM engine and language data never load as part
   of the app's normal startup. Create one Worker; keep it alive for the
   scanning session; terminate it when the scanner closes (success,
   cancel, or navigating away) — creating a fresh worker per frame would
   make each attempt take seconds instead of hundreds of milliseconds.
3. **Detection loop.** Roughly every 600ms: draw the current video frame
   to an offscreen canvas at a reduced resolution (fast OCR, not
   accurate OCR), run the worker's `recognize()`, and check the result
   against the shared email/phone signal-detection module. No match:
   keep looping. Match: stop the loop immediately.
4. **Confirmation pass.** Draw one more frame — full resolution this
   time — and run a second `recognize()` against it. Show "Business Card
   Detected ✓" on the guide overlay during this brief pause. Run the full
   field parser (see below) against this pass's text, not the trigger
   pass's.
5. **Review.** Open the existing add-contact dialog
   (`LeadFormDialog`/`LeadForm`, reused — see UI flow) pre-filled with
   the parsed fields. Camera and worker are torn down at this point; no
   frame data survives past this step.
6. If the loop runs for a while (~20-30 seconds) without a detection, show
   a subtle "still looking — try repositioning the card" hint rather than
   giving up silently. The user can cancel out at any time; there's no
   forced timeout that closes the scanner on its own.

## Field parsing

Input: the confirmation pass's OCR text, split into non-empty lines. Same
claim-and-remove ordering principle as the original design — each rule
claims a line and removes it from consideration by later, more general
rules:

1. **Email** — first match wins.
2. **Phone** — first match wins, tolerant of common formats (parens,
   dashes, dots, `+1`).
3. **Secondary phone** — a second, different line matching the same phone
   pattern, claimed only after the first is already claimed.
4. **LinkedIn** — a line containing `linkedin.com`.
5. **Website** — a bare-domain-shaped line, not the domain already
   claimed by the email or LinkedIn line.
6. **City/State/ZIP** — a line matching `<text>, <2-letter state> <5-digit
   zip>` (optionally `-<4 digits>`). If that same line also has content
   before a comma that looks like a street address, split there: the
   part before becomes a street-address candidate, the remainder is
   parsed for city/state/zip. City goes to the existing `city` field;
   state and zip go to the two new fields.
7. **Street address** — a line starting with a number followed by a word
   (`123 Main St`), not already consumed by rule 6's split, claimed into
   `streetAddress`.
8. **Company** — a line containing a legal-entity suffix (reusing the
   `ENTITY` regex from `functions/src/lib/mlsOwner.js`, exported for this
   purpose rather than hand-copied — same reuse decision as the original
   design).
9. **Job title** — a line containing a role word (Manager, Director,
   President, Partner, Owner, CEO, CFO, COO, Founder, Agent, Broker, VP,
   Vice President, Associate, Principal).
10. **Name** — the first line not yet claimed, split into first/last on
    the last whitespace boundary; joined back into one string for
    `ownerName` before the review screen ever sees it (see Decisions).

Any line matching nothing is dropped silently, same as before — a logo
line or tagline isn't an error, it's just not contact information.

Real addresses and cards vary; this will misparse on unusual layouts. The
review screen is the correction mechanism this leans on, same principle as
the original design.

## Duplicate detection

Unchanged in mechanism from the original design — runs client-side against
the already-loaded CRM state, in order: exact email → phone (last 10
digits) → name + company both matching. First match wins. On a hit, show
*"Possible Existing Contact — {name} — {company}"* with three actions:
**Update Existing** (merges the scanned fields into that lead via
`updateLead()`), **Create New** (calls `addLead()` as normal), **Cancel**
(discards the scan, returns to the live camera).

## UI flow

Reuses the existing add-contact dialog, same as the original design's
decision: `LeadFormDialog`/`LeadForm.tsx` already accept an `initial`
value for pre-filling (this remains true — the earlier plan that would
have added an `initialValues` pass-through prop to `LeadFormDialog` was
never implemented, so that gap is still open and is this plan's job to
close, not a re-derivation). The Scan Business Card button lives in
`ContactsView.tsx`, which currently has no add-contact trigger at all.

1. Tap **Scan Business Card** → live camera view opens (see mechanism
   above).
2. On detection + confirmation pass → duplicate check runs against the
   parsed fields → if a possible match, show the three-way dialog first;
   otherwise proceed straight to review.
3. Review screen: the existing `LeadFormDialog` with `defaultKind`
   `'industry'`, pre-filled via a new `initialValues` prop threaded to
   `LeadForm`'s existing `initial` prop. Every field editable, exactly
   like manual entry. `relationshipType` renders as a dropdown, defaulting
   to unselected — never pre-filled from the scan.
4. On save, `source` is set to `'Business Card'`.

## Error handling

- Camera permission denied, or `getUserMedia` unsupported: show a message
  explaining the camera is needed, with a fallback link to open the
  regular "Add Contact" dialog blank — scanning is a shortcut, never a
  gate.
- Tesseract.js fails to load (network issue fetching the WASM/language
  data on first use): same fallback — blank manual-entry dialog.
- A confirmation-pass OCR result with too little text to detect anything:
  treat as "no card found," resume the live loop rather than opening a
  mostly-empty review screen.

## Testing

The field parser and the shared email/phone signal-detection module are
pure, dependency-free functions — testable directly with representative
OCR text samples (multi-line addresses in both one-line and two-line
forms, a second phone number, a LinkedIn URL, a line matching nothing).
The live camera/Tesseract.js loop itself is not practically unit-testable
(real camera access, real WASM OCR) — verified by manual testing on a
real device during implementation, not by an automated test.

## Risks

**Tesseract.js accuracy on business cards is genuinely lower than a cloud
OCR service**, particularly on stylized fonts, low-contrast color schemes,
and embossed or metallic finishes. This is the accepted cost of the
zero-network, zero-cost, image-never-leaves-the-device decision. The
review screen is where this gets absorbed, same as the original design's
risk framing — but it will get absorbed more often here.

**Tesseract.js's WASM + language data adds real weight to a page that
loads it.** Lazy-loading on click (rather than at app startup) keeps this
from affecting anyone who never uses the scanner, but the first tap will
have a genuine load delay before the camera view is ready — worth setting
a loading state expectation ("Loading scanner…") rather than a blank
pause.

**Live camera access requires a secure context (HTTPS) and browser
permission**, same as any `getUserMedia` use — not a new constraint this
app hasn't already dealt with for other features, but worth confirming the
CRM's deployed origin satisfies it (it does — Railway serves HTTPS by
default).
