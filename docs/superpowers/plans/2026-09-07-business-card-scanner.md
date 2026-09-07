# Business Card Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Scan Business Card" button in Contacts that opens a live camera view, detects a card automatically (no shutter button), extracts contact fields entirely on-device, and opens the existing add-contact dialog pre-filled for review.

**Architecture:** Everything runs in the browser. A live `getUserMedia` video feed is polled every ~600ms with a fast, low-resolution Tesseract.js OCR pass purely to detect "a card is present" (checked against a shared email/phone signal module); on detection, one more OCR pass runs against a fresh, full-resolution frame, and that text is what actually gets parsed into fields. No image or frame data is ever uploaded, stored, or attached to anything. The backend is only involved in the final save, via the CRM's existing `addLead()`/`updateLead()` path — no new backend endpoint.

**Tech Stack:** React 19 + TypeScript + Zustand (existing CRM), Tesseract.js (WASM OCR, new dependency), `getUserMedia` (new browser API for this codebase — the existing camera precedent, `DrivingView.tsx`, is single-shot `<input capture>`, not a live feed), Vitest + Testing Library (existing).

**Spec:** `docs/superpowers/specs/2026-09-07-business-card-scanner-design.md`

## Global Constraints

- **No network call for scanning, ever.** Camera capture, live detection, and field extraction are 100% client-side (Tesseract.js/WASM). The backend is touched only by the existing whole-state CRM sync when the user saves — never by the scan itself.
- **No frame, canvas, or image data may be uploaded, written to disk, or attached to a contact.** Each captured frame exists only in browser memory for the duration of one OCR pass, then is discarded.
- **Reuse existing `Lead` fields where they already mean the right thing** — do not introduce new fields for Name (→ `ownerName`), Company (→ `firm`, which already keeps `businessName` in sync), Job Title (→ `jobTitleIndustry`), or City (→ `city`). Only `secondaryPhone`, `website`, `streetAddress`, `state`, `zip`, `linkedIn`, and `relationshipType` are genuinely new fields.
- **No `addedBy` field** — this CRM is single-user per account; ownership already answers "who added this."
- **`relationshipType` is never pre-filled from the scan** — always starts unselected, even though every other field is pre-filled.
- **Duplicate detection order is email → phone (last 10 digits) → name + firm (both)**, first match wins, unchanged from prior design work in this codebase.
- **The `ENTITY` company-suffix regex is hand-copied from `functions/src/lib/mlsOwner.js`, not imported.** That file is backend-only CommonJS; this parser runs entirely in the frontend Vite/ESM build, which cannot `require()` across that boundary. The copy carries a comment pointing back at the source of truth.
- This repo already has `vitest` + `@testing-library/react` configured (`npm test` runs the whole suite, frontend and backend together) — unlike a sibling repo touched in earlier work, there is no test-framework gap here. The live camera/Tesseract.js loop itself is the one piece that is not practically unit-testable (real camera, real WASM); everything else gets real tests.
- No local database exists in this environment — never run `prisma db push` or any `migrate` command. `prisma validate`/`prisma generate` need `DATABASE_URL`; a dummy `postgresql://u:p@localhost:5432/db` works without connecting. Schema changes reach production through `functions/start.sh`'s own `prisma db push` at deploy time.
- Path alias `@/` → `src/`. Commit after every task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `functions/prisma/schema.prisma` | `CrmLead` gains 7 fields |
| `functions/src/routes/crm.js` | `PUT /state` upsert mapping gains the same 7 fields |
| `src/crm/data/types.ts` | `Lead` gains 7 fields; `Source` gains `'Business Card'`; new `RelationshipType`/`RELATIONSHIP_TYPES` |
| `src/crm/lib/businessCardText.ts` | **New.** Shared email/phone detection, used by both the live trigger and the parser |
| `src/crm/lib/businessCardParser.ts` | **New.** Pure text → structured-fields parser |
| `src/crm/lib/duplicateDetection.ts` | **New.** 3-tier duplicate match + existing-record merge |
| `src/crm/lib/mapScannedCardToLead.ts` | **New.** Bridges the parser's field names to the CRM's `Lead` schema |
| `src/crm/lib/tesseractWorker.ts` | **New.** Thin wrapper around the `tesseract.js` API |
| `src/crm/components/scanner/BusinessCardScanner.tsx` | **New.** Live camera view, detection loop, guide overlay |
| `src/crm/components/scanner/DuplicateContactDialog.tsx` | **New.** The 3-way "Possible Existing Contact" dialog |
| `src/crm/components/leads/LeadForm.tsx` | Renders and submits the 7 new fields |
| `src/crm/components/leads/LeadFormDialog.tsx` | Gains `initialValues` pre-fill and `editLeadId` edit-mode |
| `src/crm/views/ContactsView.tsx` | The Scan Business Card button and the full scan → duplicate-check → review flow |
| `package.json` | Gains the `tesseract.js` dependency |

---

### Task 1: Schema and type additions

**Files:**
- Modify: `functions/prisma/schema.prisma` (`model CrmLead`)
- Modify: `functions/src/routes/crm.js` (the lead upsert `data` mapping)
- Modify: `src/crm/data/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Lead.secondaryPhone`, `Lead.website`, `Lead.streetAddress`, `Lead.state`, `Lead.zip`, `Lead.linkedIn`, `Lead.relationshipType`; `Source` including `'Business Card'`; `type RelationshipType`; `RELATIONSHIP_TYPES: RelationshipType[]`

- [ ] **Step 1: Add the fields to `CrmLead`**

In `functions/prisma/schema.prisma`, inside `model CrmLead`, add immediately after the `city` line:

```prisma
  secondaryPhone        String    @default("")
  website               String    @default("")
  streetAddress         String    @default("")
  state                 String    @default("")
  zip                   String    @default("")
  linkedIn              String    @default("")
  relationshipType      String    @default("")
```

- [ ] **Step 2: Verify the schema**

```bash
cd functions
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate
```

Expected: valid, and `Generated Prisma Client`. Do NOT run `db push` or any `migrate` command.

- [ ] **Step 3: Persist the new fields on save**

In `functions/src/routes/crm.js`, find the lead upsert's `data` object (the block containing `businessName: lead.businessName ?? ''`). Add, in the same style, immediately after the existing `notes: lead.notes ?? '',` line:

```js
          secondaryPhone: lead.secondaryPhone ?? '',
          website: lead.website ?? '',
          streetAddress: lead.streetAddress ?? '',
          state: lead.state ?? '',
          zip: lead.zip ?? '',
          linkedIn: lead.linkedIn ?? '',
          relationshipType: lead.relationshipType ?? '',
```

Skipping this step means these fields save from the client but silently vanish on the next load — the whole-state `PUT` explicitly lists which fields it writes.

- [ ] **Step 4: Add the frontend types**

In `src/crm/data/types.ts`, find `export type Source =` and add one more line to the union:

```ts
  | 'Business Card'
```

Add the same value to `export const SOURCES: Source[] = [...]`, at the end of the array.

Then, near the other categorical type/const pairs (e.g. `AgeRange`/`AGE_RANGES`), add:

```ts
export type RelationshipType =
  | ''
  | 'Property Owner'
  | 'Investor'
  | 'Broker'
  | 'Real Estate Agent'
  | 'Lender'
  | 'Property Manager'
  | 'Developer'
  | 'Contractor'
  | 'Vendor'
  | 'Attorney'
  | 'CPA'
  | 'Other'

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  '',
  'Property Owner',
  'Investor',
  'Broker',
  'Real Estate Agent',
  'Lender',
  'Property Manager',
  'Developer',
  'Contractor',
  'Vendor',
  'Attorney',
  'CPA',
  'Other',
]
```

The empty string is a real member of the type (the "not set" default), not a placeholder.

Then find `export type Lead = {` and add, immediately after the `city: string` line:

```ts
  secondaryPhone: string
  website: string
  streetAddress: string
  state: string
  zip: string
  linkedIn: string
  relationshipType: RelationshipType
```

- [ ] **Step 5: Verify**

```bash
node --check functions/src/routes/crm.js
npm run build
```

Expected: `node --check` exits 0 with no output; `npm run build` exits 0. This task is schema/type additions with no new logic — Task 4 tests the duplicate-detection logic that reads these fields, and Task 5 exercises the form that renders them.

- [ ] **Step 6: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/routes/crm.js src/crm/data/types.ts
git commit -m "Add business-card-scan fields to CRM leads"
```

---

### Task 2: Shared email/phone signal detection

**Files:**
- Create: `src/crm/lib/businessCardText.ts`
- Test: `src/crm/lib/businessCardText.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `EMAIL_PATTERN: RegExp`, `PHONE_PATTERN: RegExp`, `hasContactSignal(text: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/crm/lib/businessCardText.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hasContactSignal, EMAIL_PATTERN, PHONE_PATTERN } from './businessCardText'

describe('hasContactSignal', () => {
  it('is true when the text contains an email address', () => {
    expect(hasContactSignal('John Smith\njohn@example.com')).toBe(true)
  })

  it('is true when the text contains a phone-shaped sequence', () => {
    expect(hasContactSignal('John Smith\n(210) 555-1234')).toBe(true)
  })

  it('is false when the text has neither', () => {
    expect(hasContactSignal('John Smith\nManaging Partner')).toBe(false)
  })

  it('is false for an empty string', () => {
    expect(hasContactSignal('')).toBe(false)
  })
})

describe('EMAIL_PATTERN', () => {
  it('matches a standard email address embedded in other text', () => {
    expect(EMAIL_PATTERN.test('reach me at jane@abcdev.com today')).toBe(true)
  })
})

describe('PHONE_PATTERN', () => {
  it('matches common phone formats', () => {
    expect(PHONE_PATTERN.test('(210) 555-1234')).toBe(true)
    expect(PHONE_PATTERN.test('210-555-1234')).toBe(true)
    expect(PHONE_PATTERN.test('210.555.1234')).toBe(true)
    expect(PHONE_PATTERN.test('+1 210 555 1234')).toBe(true)
  })

  it('does not match a short digit sequence', () => {
    expect(PHONE_PATTERN.test('Suite 400')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/crm/lib/businessCardText.test.ts`
Expected: FAIL — cannot find module `./businessCardText`.

- [ ] **Step 3: Implement**

Create `src/crm/lib/businessCardText.ts`:

```ts
/**
 * Shared email/phone detection used by both the live scanner's "is a card
 * here yet" trigger (BusinessCardScanner.tsx) and the full field parser
 * (businessCardParser.ts) — one definition instead of two regexes that
 * could quietly drift apart.
 */

export const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
export const PHONE_PATTERN = /(\+?\d[\d\s().-]{8,}\d)/

export const hasContactSignal = (text: string): boolean =>
  EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/crm/lib/businessCardText.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/crm/lib/businessCardText.ts src/crm/lib/businessCardText.test.ts
git commit -m "Add shared email/phone signal detection"
```

---

### Task 3: The business card field parser

**Files:**
- Create: `src/crm/lib/businessCardParser.ts`
- Test: `src/crm/lib/businessCardParser.test.ts`

**Interfaces:**
- Consumes: `EMAIL_PATTERN`, `PHONE_PATTERN` from `businessCardText.ts` (Task 2)
- Produces: `type ParsedBusinessCard` (13 string fields: `firstName`, `lastName`, `company`, `jobTitle`, `phone`, `secondaryPhone`, `email`, `website`, `streetAddress`, `city`, `state`, `zip`, `linkedIn`), `parseBusinessCard(rawText: string): ParsedBusinessCard`

- [ ] **Step 1: Write the failing test**

Create `src/crm/lib/businessCardParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseBusinessCard } from './businessCardParser'

describe('parseBusinessCard', () => {
  it('extracts an email', () => {
    expect(parseBusinessCard('John Smith\njohn@abcdevelopment.com').email).toBe('john@abcdevelopment.com')
  })

  it('extracts a phone number in common formats', () => {
    expect(parseBusinessCard('Jane Doe\n(210) 555-1234').phone).toBe('(210) 555-1234')
    expect(parseBusinessCard('Jane Doe\n210-555-1234').phone).toBe('210-555-1234')
    expect(parseBusinessCard('Jane Doe\n210.555.1234').phone).toBe('210.555.1234')
    expect(parseBusinessCard('Jane Doe\n+1 210 555 1234').phone).toBe('+1 210 555 1234')
  })

  it('extracts a second phone number as secondaryPhone', () => {
    const result = parseBusinessCard('Jane Doe\n(210) 555-1234\n(210) 555-9999')
    expect(result.phone).toBe('(210) 555-1234')
    expect(result.secondaryPhone).toBe('(210) 555-9999')
  })

  it('leaves secondaryPhone empty when there is only one phone number', () => {
    expect(parseBusinessCard('Jane Doe\n(210) 555-1234').secondaryPhone).toBe('')
  })

  it('extracts a LinkedIn line', () => {
    expect(parseBusinessCard('John Smith\nlinkedin.com/in/johnsmith').linkedIn).toBe('linkedin.com/in/johnsmith')
  })

  it('extracts a website that is not the email domain', () => {
    const result = parseBusinessCard('John Smith\njohn@abcdevelopment.com\nabcdevelopment.com')
    expect(result.website).toBe('abcdevelopment.com')
  })

  it('does not mistake the email domain for a separate website', () => {
    expect(parseBusinessCard('John Smith\njohn@abcdevelopment.com').website).toBe('')
  })

  it('splits a two-line address into street, city, state, and zip', () => {
    const result = parseBusinessCard('John Smith\n123 Main St\nSan Antonio, TX 78205')
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.city).toBe('San Antonio')
    expect(result.state).toBe('TX')
    expect(result.zip).toBe('78205')
  })

  it('splits a one-line combined address into street, city, state, and zip', () => {
    const result = parseBusinessCard('John Smith\n123 Main St, San Antonio, TX 78205')
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.city).toBe('San Antonio')
    expect(result.state).toBe('TX')
    expect(result.zip).toBe('78205')
  })

  it('handles a 9-digit ZIP', () => {
    expect(parseBusinessCard('John Smith\nSan Antonio, TX 78205-1234').zip).toBe('78205-1234')
  })

  it('extracts a company line by its legal suffix', () => {
    expect(parseBusinessCard('John Smith\nABC Development LLC').company).toBe('ABC Development LLC')
  })

  it('extracts a title line by its role word', () => {
    expect(parseBusinessCard('John Smith\nManaging Partner').jobTitle).toBe('Managing Partner')
  })

  it('claims a company line before title, even when it contains a role word', () => {
    const result = parseBusinessCard('John Smith\nPartners Realty Group')
    expect(result.company).toBe('Partners Realty Group')
    expect(result.jobTitle).toBe('')
  })

  it('splits a two-word first line into first and last name', () => {
    const result = parseBusinessCard('John Smith')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('treats a single-word name as first name only', () => {
    const result = parseBusinessCard('Cher')
    expect(result.firstName).toBe('Cher')
    expect(result.lastName).toBe('')
  })

  it('takes the first unclaimed line as the name, even if it is not first overall', () => {
    const result = parseBusinessCard('ABC Development LLC\nJohn Smith\njohn@abcdevelopment.com')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
    expect(result.company).toBe('ABC Development LLC')
  })

  it('drops a line matching nothing rather than misassigning it', () => {
    const result = parseBusinessCard('John Smith\n"Building relationships since 1998"')
    expect(result.firstName).toBe('John')
    expect(Object.values(result)).not.toContain('"Building relationships since 1998"')
  })

  it('returns every field as an empty string for blank input', () => {
    expect(parseBusinessCard('')).toEqual({
      firstName: '', lastName: '', company: '', jobTitle: '',
      phone: '', secondaryPhone: '', email: '', website: '',
      streetAddress: '', city: '', state: '', zip: '', linkedIn: '',
    })
  })

  it('returns every field as an empty string for whitespace-only input', () => {
    const result = parseBusinessCard('   \n  \n  ')
    expect(result.firstName).toBe('')
    expect(result.email).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/crm/lib/businessCardParser.test.ts`
Expected: FAIL — cannot find module `./businessCardParser`.

- [ ] **Step 3: Implement**

Create `src/crm/lib/businessCardParser.ts`:

```ts
/**
 * Turns the raw text a live-scanned business card produces (see
 * BusinessCardScanner.tsx) into structured contact fields. Regex and
 * ordered heuristics, not an LLM or cloud call — this stays entirely
 * client-side, matching the design's zero-network decision.
 *
 * Each rule below claims a line and removes it from consideration by
 * later rules, applied in an order chosen so a more specific rule always
 * runs before a more general one that could misfire on the same line.
 *
 * None of this will be perfect on an unusual card — Tesseract.js itself
 * is less accurate than a cloud OCR service, which this design accepted
 * in exchange for zero network calls and zero ongoing cost. The review
 * screen this feeds is where a wrong guess gets corrected.
 */

import { EMAIL_PATTERN, PHONE_PATTERN } from './businessCardText'

// Hand-copied from functions/src/lib/mlsOwner.js's ENTITY constant — that
// file is backend-only (Node/CommonJS) and this parser runs entirely in
// the browser (Vite/ESM), so it can't be imported directly across that
// boundary. Keep the two in sync by hand if either changes.
const ENTITY =
  /\b(LLC|L\.L\.C|LCC|PLLC|LP|L\.P|LLP|LLLP|INC|TRUST|PROPERTIES|CORP|HOLDINGS|LTD|INVESTMENTS|PARTNERS|COMPANY|GROUP|ENTERPRISES|REALTY|RENTALS|MANAGEMENT|VENTURES|ASSOCIATES|EQUITY|CAPITAL|DEVELOPMENT|HOMES|ESTATES)\b/i

const LINKEDIN_PATTERN = /linkedin\.com\S*/i
const WEBSITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i
const CITY_STATE_ZIP_PATTERN = /^(.*?),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
const STREET_START_PATTERN = /^\d+\s+\S/
const TITLE_WORD_PATTERN = /\b(manager|director|president|partner|owner|ceo|cfo|coo|founder|agent|broker|vp|vice president|associate|principal)\b/i

export type ParsedBusinessCard = {
  firstName: string
  lastName: string
  company: string
  jobTitle: string
  phone: string
  secondaryPhone: string
  email: string
  website: string
  streetAddress: string
  city: string
  state: string
  zip: string
  linkedIn: string
}

const emptyResult = (): ParsedBusinessCard => ({
  firstName: '', lastName: '', company: '', jobTitle: '',
  phone: '', secondaryPhone: '', email: '', website: '',
  streetAddress: '', city: '', state: '', zip: '', linkedIn: '',
})

export const parseBusinessCard = (rawText: string): ParsedBusinessCard => {
  const result = emptyResult()
  const lines = String(rawText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const take = (index: number) => lines.splice(index, 1)

  // 1. Email — first match wins.
  {
    const index = lines.findIndex((line) => EMAIL_PATTERN.test(line))
    if (index !== -1) {
      result.email = lines[index].match(EMAIL_PATTERN)![0]
      take(index)
    }
  }

  // 2. Phone — first match wins.
  {
    const index = lines.findIndex((line) => PHONE_PATTERN.test(line))
    if (index !== -1) {
      result.phone = lines[index].match(PHONE_PATTERN)![0].trim()
      take(index)
    }
  }

  // 3. Secondary phone — a second, different phone-shaped line.
  {
    const index = lines.findIndex((line) => PHONE_PATTERN.test(line))
    if (index !== -1) {
      result.secondaryPhone = lines[index].match(PHONE_PATTERN)![0].trim()
      take(index)
    }
  }

  // 4. LinkedIn.
  {
    const index = lines.findIndex((line) => LINKEDIN_PATTERN.test(line))
    if (index !== -1) {
      result.linkedIn = lines[index].match(LINKEDIN_PATTERN)![0]
      take(index)
    }
  }

  // 5. Website — not the email/LinkedIn line, which are already removed.
  {
    const index = lines.findIndex((line) => WEBSITE_PATTERN.test(line) && !line.includes('@'))
    if (index !== -1) {
      result.website = lines[index].match(WEBSITE_PATTERN)![0]
      take(index)
    }
  }

  // 6. City/State/ZIP, with an optional embedded street prefix on the same line.
  {
    const index = lines.findIndex((line) => CITY_STATE_ZIP_PATTERN.test(line))
    if (index !== -1) {
      const match = lines[index].match(CITY_STATE_ZIP_PATTERN)!
      let cityPart = match[1]
      result.state = match[2]
      result.zip = match[3]
      const commaIndex = cityPart.indexOf(',')
      if (commaIndex !== -1 && STREET_START_PATTERN.test(cityPart.slice(0, commaIndex).trim())) {
        result.streetAddress = cityPart.slice(0, commaIndex).trim()
        cityPart = cityPart.slice(commaIndex + 1)
      }
      result.city = cityPart.trim()
      take(index)
    }
  }

  // 7. Street address — a separate line, if not already captured by rule 6.
  if (!result.streetAddress) {
    const index = lines.findIndex((line) => STREET_START_PATTERN.test(line))
    if (index !== -1) {
      result.streetAddress = lines[index]
      take(index)
    }
  }

  // 8. Company — a legal-entity suffix.
  {
    const index = lines.findIndex((line) => ENTITY.test(line))
    if (index !== -1) {
      result.company = lines[index]
      take(index)
    }
  }

  // 9. Job title — a role word.
  {
    const index = lines.findIndex((line) => TITLE_WORD_PATTERN.test(line))
    if (index !== -1) {
      result.jobTitle = lines[index]
      take(index)
    }
  }

  // 10. Name — the first remaining line.
  if (lines.length) {
    const parts = lines[0].split(/\s+/).filter(Boolean)
    result.firstName = parts[0] ?? ''
    result.lastName = parts.slice(1).join(' ')
  }

  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/crm/lib/businessCardParser.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: 25 more tests than the pre-existing baseline (6 from Task 2 + 19 here). Report the exact before/after numbers you observe.

- [ ] **Step 6: Commit**

```bash
git add src/crm/lib/businessCardParser.ts src/crm/lib/businessCardParser.test.ts
git commit -m "Add the business card field parser"
```

---

### Task 4: Duplicate detection and existing-record merge

**Files:**
- Create: `src/crm/lib/duplicateDetection.ts`
- Test: `src/crm/lib/duplicateDetection.test.ts`

**Interfaces:**
- Consumes: `Lead` from `src/crm/data/types.ts` (Task 1)
- Produces: `findPossibleDuplicate(candidate: Pick<Lead, 'email'|'phone'|'ownerName'|'firm'>, existingLeads: Lead[]): Lead | null`, `mergeScannedIntoLead(existing: Lead, scanned: Partial<Lead>): Lead`

- [ ] **Step 1: Write the failing test**

Create `src/crm/lib/duplicateDetection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findPossibleDuplicate, mergeScannedIntoLead } from './duplicateDetection'
import type { Lead } from '@/crm/data/types'

const baseLead: Lead = {
  id: '1', businessName: 'ABC Development LLC', ownerName: 'John Smith',
  jobTitleIndustry: 'Managing Partner', firm: 'ABC Development LLC',
  phone: '(210) 555-1234', email: 'john@abcdevelopment.com',
  industry: 'Other', city: 'San Antonio', asset: '', specialization: '',
  metPersonally: '', source: 'Referral', websiteStatus: 'This Week',
  connectionRating: 'none', lastConversationNotes: '', notes: '',
  kind: 'industry', lastContactedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  secondaryPhone: '', website: '', streetAddress: '', state: '', zip: '',
  linkedIn: '', relationshipType: '',
}

describe('findPossibleDuplicate', () => {
  it('matches on exact email, case-insensitively', () => {
    const found = findPossibleDuplicate(
      { email: 'JOHN@ABCDEVELOPMENT.COM', phone: '', ownerName: '', firm: '' },
      [baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('matches on phone, ignoring formatting differences', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '210.555.1234', ownerName: '', firm: '' },
      [baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('matches on name and firm together, case-insensitively', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '', ownerName: 'john smith', firm: 'abc development llc' },
      [baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('does not match on name alone without a matching firm', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '', ownerName: 'John Smith', firm: 'A Different Company' },
      [baseLead],
    )
    expect(found).toBeNull()
  })

  it('does not match on firm alone without a matching name', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '', ownerName: 'Someone Else', firm: 'ABC Development LLC' },
      [baseLead],
    )
    expect(found).toBeNull()
  })

  it('returns null when nothing matches', () => {
    const found = findPossibleDuplicate(
      { email: 'new@example.com', phone: '555-000-0000', ownerName: 'Nobody', firm: 'Nothing' },
      [baseLead],
    )
    expect(found).toBeNull()
  })

  it('checks email before phone before name+firm, returning the first hit', () => {
    const secondLead: Lead = { ...baseLead, id: '2', email: 'different@example.com', phone: '999-999-9999' }
    const found = findPossibleDuplicate(
      { email: 'john@abcdevelopment.com', phone: '999-999-9999', ownerName: '', firm: '' },
      [secondLead, baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('returns null against an empty lead list', () => {
    expect(findPossibleDuplicate({ email: 'john@abcdevelopment.com', phone: '', ownerName: '', firm: '' }, [])).toBeNull()
  })
})

describe('mergeScannedIntoLead', () => {
  it('fills in a blank field from the scan', () => {
    const existing: Lead = { ...baseLead, website: '' }
    const merged = mergeScannedIntoLead(existing, { website: 'abcdevelopment.com' })
    expect(merged.website).toBe('abcdevelopment.com')
  })

  it('keeps the existing value when the field is already set', () => {
    const existing: Lead = { ...baseLead, phone: '(210) 555-0000' }
    const merged = mergeScannedIntoLead(existing, { phone: '(210) 555-9999' })
    expect(merged.phone).toBe('(210) 555-0000')
  })

  it('leaves a field blank when neither existing nor scanned has a value', () => {
    const existing: Lead = { ...baseLead, linkedIn: '' }
    const merged = mergeScannedIntoLead(existing, { linkedIn: '' })
    expect(merged.linkedIn).toBe('')
  })

  it('does not touch fields the scan did not include', () => {
    const existing: Lead = { ...baseLead, notes: 'Met at conference' }
    const merged = mergeScannedIntoLead(existing, { website: 'new-site.com' })
    expect(merged.notes).toBe('Met at conference')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/crm/lib/duplicateDetection.test.ts`
Expected: FAIL — cannot find module `./duplicateDetection`.

- [ ] **Step 3: Implement**

Create `src/crm/lib/duplicateDetection.ts`:

```ts
import type { Lead } from '@/crm/data/types'

type Candidate = Pick<Lead, 'email' | 'phone' | 'ownerName' | 'firm'>

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(-10)

/**
 * Checked in this order — email, then phone, then name+firm — because
 * that is the order of confidence: an email match is almost never a
 * coincidence, a phone match rarely is, and a name+firm match is the
 * weakest signal, which is why it requires both rather than either alone.
 */
export const findPossibleDuplicate = (candidate: Candidate, existingLeads: Lead[]): Lead | null => {
  const email = candidate.email.trim().toLowerCase()
  if (email) {
    const match = existingLeads.find((lead) => lead.email.trim().toLowerCase() === email)
    if (match) return match
  }

  const phone = digitsOnly(candidate.phone)
  if (phone.length === 10) {
    const match = existingLeads.find((lead) => digitsOnly(lead.phone) === phone)
    if (match) return match
  }

  const name = candidate.ownerName.trim().toLowerCase()
  const firm = candidate.firm.trim().toLowerCase()
  if (name && firm) {
    const match = existingLeads.find(
      (lead) =>
        lead.ownerName.trim().toLowerCase() === name &&
        lead.firm.trim().toLowerCase() === firm,
    )
    if (match) return match
  }

  return null
}

/**
 * For the "Update Existing" duplicate-resolution path: the existing
 * lead's own values win wherever it already has one; scanned values fill
 * in only what's currently blank. Never overwrites a field the contact
 * already had.
 */
export const mergeScannedIntoLead = (existing: Lead, scanned: Partial<Lead>): Lead => {
  const merged: Lead = { ...existing }
  ;(Object.keys(scanned) as (keyof Lead)[]).forEach((key) => {
    const existingValue = existing[key]
    const scannedValue = scanned[key]
    if (!existingValue && scannedValue) {
      merged[key] = scannedValue as never
    }
  })
  return merged
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/crm/lib/duplicateDetection.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: 12 more tests than the end of Task 3. Report the exact numbers.

- [ ] **Step 6: Commit**

```bash
git add src/crm/lib/duplicateDetection.ts src/crm/lib/duplicateDetection.test.ts
git commit -m "Add duplicate-contact detection and merge"
```

---

### Task 5: Form fields for the new columns, and dialog pre-fill/edit support

**Files:**
- Modify: `src/crm/components/leads/LeadForm.tsx`
- Modify: `src/crm/components/leads/LeadFormDialog.tsx`

**Interfaces:**
- Consumes: `RELATIONSHIP_TYPES`, `type RelationshipType` from `src/crm/data/types.ts` (Task 1)
- Produces: `LeadForm`'s exported `FormValues` type (currently unexported — this task exports it); `LeadFormDialog` gains `initialValues?: Partial<FormValues>` and `editLeadId?: string` props

- [ ] **Step 1: Export `FormValues` and add the 7 fields to `LeadForm`'s state**

In `src/crm/components/leads/LeadForm.tsx`:

Change `type FormValues = Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt'>` to `export type FormValues = Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt'>` — `LeadFormDialog` needs this type in the next step.

Add the import, alongside the existing named imports from `@/crm/data/types`:

```ts
  RELATIONSHIP_TYPES,
  type RelationshipType,
```

In the `useState<FormValues>` initializer, add after the `letterCadenceDays: initial?.letterCadenceDays,` line:

```ts
    secondaryPhone: initial?.secondaryPhone ?? '',
    website: initial?.website ?? '',
    streetAddress: initial?.streetAddress ?? '',
    state: initial?.state ?? '',
    zip: initial?.zip ?? '',
    linkedIn: initial?.linkedIn ?? '',
    relationshipType: initial?.relationshipType ?? '',
```

This step is easy to get wrong by assuming the new fields "just work" because `Lead`/`FormValues` now include them — they do not, because this component reads `initial` field-by-field. Skipping this step means scanned values are silently dropped the moment they reach this form.

- [ ] **Step 2: Clear the new fields on the retail submit path**

In the `onSubmit` handler's `if (values.kind === 'retail')` branch, add to the object spread (alongside the existing `businessName: '', firm: '', jobTitleIndustry: '', asset: '', specialization: '',` resets):

```ts
            secondaryPhone: '',
            website: '',
            streetAddress: '',
            state: '',
            zip: '',
            linkedIn: '',
            relationshipType: '',
```

These fields are business-card/industry-relationship concepts; a retail stay-in-touch contact shouldn't carry them, matching how the existing industry-only fields are already cleared on this path.

- [ ] **Step 3: Render the fields**

In the `values.kind === 'industry'` grid, immediately after the `phone` field's `<div>` and before the `asset` field's `<div>`, add:

```tsx
        <div className="space-y-1.5">
          <Label htmlFor="secondary-phone">Secondary Phone</Label>
          <Input
            id="secondary-phone"
            value={values.secondaryPhone}
            onChange={(event) => updateField('secondaryPhone', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={values.website}
            onChange={(event) => updateField('website', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="street-address">Street Address</Label>
          <Input
            id="street-address"
            value={values.streetAddress}
            onChange={(event) => updateField('streetAddress', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={values.state}
            onChange={(event) => updateField('state', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zip">ZIP</Label>
          <Input
            id="zip"
            value={values.zip}
            onChange={(event) => updateField('zip', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="linkedin">LinkedIn</Label>
          <Input
            id="linkedin"
            value={values.linkedIn}
            onChange={(event) => updateField('linkedIn', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="relationship-type">Relationship Type</Label>
          <Select
            value={values.relationshipType}
            onValueChange={(value) => updateField('relationshipType', value as RelationshipType)}
          >
            <SelectTrigger id="relationship-type">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_TYPES.filter((option) => option !== '').map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
```

`Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` are already imported in this file — do not add a duplicate import.

- [ ] **Step 4: Add `initialValues` pre-fill and `editLeadId` edit-mode to `LeadFormDialog`**

In `src/crm/components/leads/LeadFormDialog.tsx`:

Add to the import from `@/crm/components/leads/LeadForm`: change `import { LeadForm } from '@/crm/components/leads/LeadForm'` to `import { LeadForm, type FormValues } from '@/crm/components/leads/LeadForm'`.

Add `updateLead` to the store selectors, alongside the existing `addLead`:

```ts
  const updateLead = useCrmStore((state) => state.updateLead)
```

Change the `Props` type to:

```ts
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultKind?: LeadKind
  initialValues?: Partial<FormValues>
  editLeadId?: string
}
```

Change the function signature to destructure the two new props:

```ts
export function LeadFormDialog({ open, onOpenChange, defaultKind = 'industry', initialValues, editLeadId }: Props) {
```

Add, after the `const kind = kindForDestination(destination)` line:

```ts
  const isEditing = Boolean(editLeadId)
```

Replace the `<DialogHeader>` block with:

```tsx
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Update Contact' : titleFor(destination)}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Review and correct the scanned details before saving.' : descriptionFor(destination)}
          </DialogDescription>
        </DialogHeader>
```

Wrap the existing "Where to put this contact?" `<div>` (the destination `Select`) in `{isEditing ? null : ( ... )}` — editing an existing contact doesn't need a destination picker, since the contact's kind is already fixed.

Change the opportunity-outreach block's condition from `destination === 'opportunity' ?` to `!isEditing && destination === 'opportunity' ?`.

Replace the `<LeadForm .../>` call with:

```tsx
        <LeadForm
          key={editLeadId ?? kind}
          defaultKind={kind}
          initial={initialValues}
          onSubmit={(values) => {
            if (editLeadId) {
              updateLead(editLeadId, values)
              show('Contact updated')
              onOpenChange(false)
              return
            }
            const lead = addLead(values)
            if (destination === 'opportunity') {
              createOpportunity(lead.id)
              const trimmed = outreachMessage.trim()
              if (trimmed) {
                addActivity(lead.id, 'note', `First outreach: ${trimmed}`)
              }
            }
            show(toastFor(destination))
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={isEditing ? 'Save Changes' : submitLabelFor(destination)}
        />
```

- [ ] **Step 5: Verify**

```bash
npm test
npm run build
```

Expected: the same test count as the end of Task 4 — this task changes UI/props, not pure logic. If `LeadForm.test.tsx` or `LeadFormDialog.test.tsx` exist, run them specifically first and confirm they still pass unchanged before running the full suite.

- [ ] **Step 6: Commit**

```bash
git add src/crm/components/leads/LeadForm.tsx src/crm/components/leads/LeadFormDialog.tsx
git commit -m "Add scan fields to the contact form and pre-fill/edit support to the dialog"
```

---

### Task 6: The live camera scanner

**Files:**
- Modify: `package.json` (add `tesseract.js`)
- Create: `src/crm/lib/tesseractWorker.ts`
- Create: `src/crm/components/scanner/BusinessCardScanner.tsx`

**Interfaces:**
- Consumes: `hasContactSignal` from `businessCardText.ts` (Task 2)
- Produces: `BusinessCardScanner({ open, onDetected, onCancel }): JSX.Element | null` where `onDetected: (rawText: string) => void` fires once, with the confirmation pass's recognized text

- [ ] **Step 1: Add the dependency**

```bash
npm view tesseract.js version
```

Note the printed version, then add it as an exact dependency in `package.json`'s `"dependencies"` block (alphabetical position, matching the file's existing style):

```json
    "tesseract.js": "<the exact version just printed>",
```

```bash
npm install
```

- [ ] **Step 2: The worker wrapper**

Create `src/crm/lib/tesseractWorker.ts`:

```ts
/**
 * Thin wrapper around tesseract.js so the scanner component doesn't need
 * to know the library's specific API — creating a worker, running OCR
 * against a canvas, and tearing the worker down are the only operations
 * this feature needs.
 */
import { createWorker, type Worker } from 'tesseract.js'

export const createScannerWorker = (): Promise<Worker> => createWorker('eng')

export const recognizeCanvas = async (worker: Worker, canvas: HTMLCanvasElement): Promise<string> => {
  const { data } = await worker.recognize(canvas)
  return data.text
}

export const destroyScannerWorker = (worker: Worker): Promise<void> => worker.terminate() as unknown as Promise<void>
```

- [ ] **Step 3: The scanner component**

Create the directory `src/crm/components/scanner/` and, in it, `BusinessCardScanner.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Worker } from 'tesseract.js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { hasContactSignal } from '@/crm/lib/businessCardText'
import { createScannerWorker, destroyScannerWorker, recognizeCanvas } from '@/crm/lib/tesseractWorker'

const POLL_INTERVAL_MS = 600
const DETECTION_CANVAS_WIDTH = 480
const CONFIRMATION_CANVAS_WIDTH = 1280
const HINT_AFTER_MS = 20000

type ScanState = 'loading' | 'scanning' | 'detected' | 'error'

type Props = {
  open: boolean
  onDetected: (rawText: string) => void
  onCancel: () => void
}

export function BusinessCardScanner({ open, onDetected, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const stoppedRef = useRef(false)
  const [state, setState] = useState<ScanState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (!open) return

    stoppedRef.current = false
    setState('loading')
    setErrorMessage('')
    setShowHint(false)

    let hintTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setTimeout> | undefined

    const stopEverything = () => {
      stoppedRef.current = true
      if (hintTimer) clearTimeout(hintTimer)
      if (pollTimer) clearTimeout(pollTimer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (workerRef.current) {
        void destroyScannerWorker(workerRef.current)
        workerRef.current = null
      }
    }

    const captureFrame = (width: number): HTMLCanvasElement | null => {
      const video = videoRef.current
      if (!video || video.videoWidth === 0) return null
      const scale = width / video.videoWidth
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = Math.round(video.videoHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas
    }

    const poll = async () => {
      if (stoppedRef.current || !workerRef.current) return
      const canvas = captureFrame(DETECTION_CANVAS_WIDTH)
      if (canvas) {
        const text = await recognizeCanvas(workerRef.current, canvas)
        if (stoppedRef.current) return
        if (hasContactSignal(text)) {
          setState('detected')
          const confirmCanvas = captureFrame(CONFIRMATION_CANVAS_WIDTH)
          const confirmedText =
            confirmCanvas && workerRef.current
              ? await recognizeCanvas(workerRef.current, confirmCanvas)
              : text
          if (stoppedRef.current) return
          stopEverything()
          onDetected(confirmedText)
          return
        }
      }
      if (!stoppedRef.current) {
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (stoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const worker = await createScannerWorker()
        if (stoppedRef.current) {
          void destroyScannerWorker(worker)
          return
        }
        workerRef.current = worker

        setState('scanning')
        hintTimer = setTimeout(() => setShowHint(true), HINT_AFTER_MS)
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (stoppedRef.current) return
        setState('error')
        setErrorMessage(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access to scan a card, or add the contact manually.'
            : 'The scanner could not start. Add the contact manually instead.',
        )
      }
    }

    void start()

    return () => {
      stopEverything()
    }
  }, [open, onDetected])

  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-w-lg">
        {state === 'error' ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button onClick={onCancel}>Add Contact Manually</Button>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-md bg-black">
            <video ref={videoRef} className="w-full" playsInline muted />
            <div
              className={`pointer-events-none absolute inset-8 rounded-md border-4 ${
                state === 'detected' ? 'border-green-500' : 'border-white/70'
              }`}
            />
            {state === 'loading' && (
              <p className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                Loading scanner…
              </p>
            )}
            {state === 'detected' && (
              <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-green-400">
                Business Card Detected ✓
              </p>
            )}
            {state === 'scanning' && showHint && (
              <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/90">
                Still looking — try repositioning the card
              </p>
            )}
            <Button
              variant="ghost"
              className="absolute right-2 top-2 text-white hover:bg-white/10 hover:text-white"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Verify**

```bash
npm run build
```

Expected: exits 0. This task adds no automated tests — per the spec's Testing section and this plan's Global Constraints, the live camera feed and real WASM OCR loop are not practically unit-testable (no camera, no real recognition, in this environment). Verification here is the build passing plus manual testing on a real device during implementation: confirm the camera opens, the guide box appears, moving a real business card into frame triggers "Business Card Detected ✓," and `onDetected` fires with recognizable text. If you cannot test on a real device in this environment, say so explicitly in your report rather than claiming it works — the reviewer needs to know which parts were verified and which weren't.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/crm/lib/tesseractWorker.ts src/crm/components/scanner/BusinessCardScanner.tsx
git commit -m "Add the live business card scanner"
```

---

### Task 7: Wire the scanner into Contacts

**Files:**
- Create: `src/crm/lib/mapScannedCardToLead.ts`
- Test: `src/crm/lib/mapScannedCardToLead.test.ts`
- Create: `src/crm/components/scanner/DuplicateContactDialog.tsx`
- Modify: `src/crm/views/ContactsView.tsx`

**Interfaces:**
- Consumes: `parseBusinessCard`/`ParsedBusinessCard` (Task 3), `findPossibleDuplicate`/`mergeScannedIntoLead` (Task 4), `LeadFormDialog` with `initialValues`/`editLeadId` (Task 5), `BusinessCardScanner` (Task 6)
- Produces: the finished feature

- [ ] **Step 1: Write the failing test for the field-name bridge**

Create `src/crm/lib/mapScannedCardToLead.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapScannedCardToLead } from './mapScannedCardToLead'
import type { ParsedBusinessCard } from './businessCardParser'

const emptyParsed: ParsedBusinessCard = {
  firstName: '', lastName: '', company: '', jobTitle: '',
  phone: '', secondaryPhone: '', email: '', website: '',
  streetAddress: '', city: '', state: '', zip: '', linkedIn: '',
}

describe('mapScannedCardToLead', () => {
  it('joins first and last name into ownerName', () => {
    const result = mapScannedCardToLead({ ...emptyParsed, firstName: 'John', lastName: 'Smith' })
    expect(result.ownerName).toBe('John Smith')
  })

  it('leaves ownerName blank when neither name part was parsed', () => {
    expect(mapScannedCardToLead(emptyParsed).ownerName).toBe('')
  })

  it('maps company to both firm and businessName, matching how manual entry keeps them in sync', () => {
    const result = mapScannedCardToLead({ ...emptyParsed, company: 'ABC Development LLC' })
    expect(result.firm).toBe('ABC Development LLC')
    expect(result.businessName).toBe('ABC Development LLC')
  })

  it('maps jobTitle to jobTitleIndustry', () => {
    expect(mapScannedCardToLead({ ...emptyParsed, jobTitle: 'Managing Partner' }).jobTitleIndustry).toBe('Managing Partner')
  })

  it('sets source to Business Card', () => {
    expect(mapScannedCardToLead(emptyParsed).source).toBe('Business Card')
  })

  it('passes through the remaining new fields unchanged', () => {
    const parsed: ParsedBusinessCard = {
      ...emptyParsed,
      phone: '(210) 555-1234', secondaryPhone: '(210) 555-9999',
      email: 'john@abc.com', website: 'abc.com',
      streetAddress: '123 Main St', city: 'San Antonio', state: 'TX', zip: '78205',
      linkedIn: 'linkedin.com/in/john',
    }
    const result = mapScannedCardToLead(parsed)
    expect(result.phone).toBe('(210) 555-1234')
    expect(result.secondaryPhone).toBe('(210) 555-9999')
    expect(result.email).toBe('john@abc.com')
    expect(result.website).toBe('abc.com')
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.city).toBe('San Antonio')
    expect(result.state).toBe('TX')
    expect(result.zip).toBe('78205')
    expect(result.linkedIn).toBe('linkedin.com/in/john')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/crm/lib/mapScannedCardToLead.test.ts`
Expected: FAIL — cannot find module `./mapScannedCardToLead`.

- [ ] **Step 3: Implement the bridge**

Create `src/crm/lib/mapScannedCardToLead.ts`:

```ts
import type { Lead } from '@/crm/data/types'
import type { ParsedBusinessCard } from '@/crm/lib/businessCardParser'

/**
 * Bridges the parser's raw field names to the CRM's existing Lead schema
 * — see the design spec's field-reuse decisions: Name -> ownerName,
 * Company -> firm/businessName, Job Title -> jobTitleIndustry, and City
 * -> city already existed and mean the right thing; everything else here
 * is genuinely new.
 */
export const mapScannedCardToLead = (parsed: ParsedBusinessCard): Partial<Lead> => ({
  ownerName: [parsed.firstName, parsed.lastName].filter(Boolean).join(' '),
  firm: parsed.company,
  businessName: parsed.company,
  jobTitleIndustry: parsed.jobTitle,
  phone: parsed.phone,
  secondaryPhone: parsed.secondaryPhone,
  email: parsed.email,
  website: parsed.website,
  streetAddress: parsed.streetAddress,
  city: parsed.city,
  state: parsed.state,
  zip: parsed.zip,
  linkedIn: parsed.linkedIn,
  source: 'Business Card',
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/crm/lib/mapScannedCardToLead.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: The duplicate dialog**

Create `src/crm/components/scanner/DuplicateContactDialog.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Lead } from '@/crm/data/types'

type Props = {
  open: boolean
  possibleDuplicate: Lead | null
  onUpdateExisting: () => void
  onCreateNew: () => void
  onCancel: () => void
}

export function DuplicateContactDialog({
  open,
  possibleDuplicate,
  onUpdateExisting,
  onCreateNew,
  onCancel,
}: Props) {
  if (!possibleDuplicate) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Possible Existing Contact</DialogTitle>
          <DialogDescription>
            {possibleDuplicate.ownerName || 'This contact'}
            {possibleDuplicate.firm ? ` — ${possibleDuplicate.firm}` : ''} may already be in your
            CRM.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={onUpdateExisting}>Update Existing Contact</Button>
          <Button variant="outline" onClick={onCreateNew}>
            Create New Contact
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Wire `ContactsView.tsx`**

In `src/crm/views/ContactsView.tsx`:

Add imports:

```ts
import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { ScanLine } from 'lucide-react'
import { LeadFormDialog } from '@/crm/components/leads/LeadFormDialog'
import { DuplicateContactDialog } from '@/crm/components/scanner/DuplicateContactDialog'
import type { Lead } from '@/crm/data/types'
import { parseBusinessCard } from '@/crm/lib/businessCardParser'
import { findPossibleDuplicate, mergeScannedIntoLead } from '@/crm/lib/duplicateDetection'
import { mapScannedCardToLead } from '@/crm/lib/mapScannedCardToLead'
```

(Combine with the file's existing `useState`/`useMemo` import from `react` rather than adding a second `import ... from 'react'` line — this file already has `import { useMemo, useState } from 'react'`; add `lazy` and `Suspense` to that same line.)

Add, below the existing imports:

```ts
const BusinessCardScanner = lazy(() =>
  import('@/crm/components/scanner/BusinessCardScanner').then((m) => ({
    default: m.BusinessCardScanner,
  })),
)

type ScanFormState = {
  initialValues: Partial<Lead>
  editLeadId?: string
}
```

Inside the `ContactsView` component, add alongside the existing `useState` declarations:

```ts
  const [scannerOpen, setScannerOpen] = useState(false)
  const [possibleDuplicate, setPossibleDuplicate] = useState<Lead | null>(null)
  const [pendingScan, setPendingScan] = useState<Partial<Lead> | null>(null)
  const [scanForm, setScanForm] = useState<ScanFormState | null>(null)
```

Add, before the `return (` statement:

```ts
  const handleDetected = (rawText: string) => {
    const scanned = mapScannedCardToLead(parseBusinessCard(rawText))
    setScannerOpen(false)

    const match = findPossibleDuplicate(
      {
        email: scanned.email ?? '',
        phone: scanned.phone ?? '',
        ownerName: scanned.ownerName ?? '',
        firm: scanned.firm ?? '',
      },
      leads,
    )

    if (match) {
      setPossibleDuplicate(match)
      setPendingScan(scanned)
    } else {
      setScanForm({ initialValues: scanned })
    }
  }
```

In the header row's `<div className="flex flex-wrap gap-2 ...">`, add the button before the two existing `<span>` badges:

```tsx
          <Button size="sm" onClick={() => setScannerOpen(true)}>
            <ScanLine className="mr-1.5 h-4 w-4" /> Scan Business Card
          </Button>
```

Immediately before the component's closing `</div>`, after the existing `<ScheduleMeetingDialog .../>`, add:

```tsx
      {scannerOpen && (
        <Suspense fallback={null}>
          <BusinessCardScanner
            open={scannerOpen}
            onDetected={handleDetected}
            onCancel={() => setScannerOpen(false)}
          />
        </Suspense>
      )}

      <DuplicateContactDialog
        open={possibleDuplicate !== null}
        possibleDuplicate={possibleDuplicate}
        onUpdateExisting={() => {
          if (possibleDuplicate && pendingScan) {
            setScanForm({
              editLeadId: possibleDuplicate.id,
              initialValues: mergeScannedIntoLead(possibleDuplicate, pendingScan),
            })
          }
          setPossibleDuplicate(null)
          setPendingScan(null)
        }}
        onCreateNew={() => {
          if (pendingScan) {
            setScanForm({ initialValues: pendingScan })
          }
          setPossibleDuplicate(null)
          setPendingScan(null)
        }}
        onCancel={() => {
          setPossibleDuplicate(null)
          setPendingScan(null)
          setScannerOpen(true)
        }}
      />

      <LeadFormDialog
        open={scanForm !== null}
        onOpenChange={(open) => {
          if (!open) setScanForm(null)
        }}
        defaultKind="industry"
        initialValues={scanForm?.initialValues}
        editLeadId={scanForm?.editLeadId}
      />
```

- [ ] **Step 7: Verify**

```bash
npm test
npm run build
```

Expected: 6 more tests than the end of Task 6 (`mapScannedCardToLead.test.ts`'s new tests) — this task's other logic is UI wiring with no new pure functions to unit test; its correctness rests on the already-tested pieces from Tasks 3, 4, and the manual verification from Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/crm/lib/mapScannedCardToLead.ts src/crm/lib/mapScannedCardToLead.test.ts src/crm/components/scanner/DuplicateContactDialog.tsx src/crm/views/ContactsView.tsx
git commit -m "Wire the business card scanner into Contacts"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Fully local, no network call for scanning | 6 (getUserMedia + Tesseract.js only), Global Constraints |
| Two-pass local extraction (fast trigger, then confirmation pass) | 6 |
| Shared email/phone signal module, used by both trigger and parser | 2, consumed by 3 and 6 |
| Reuse existing fields (Name/Company/Job Title/City) | Decisions honored in Task 7's `mapScannedCardToLead` |
| 7 new fields + Source addition | 1 |
| No `addedBy` field | Not present anywhere in this plan |
| `relationshipType` never pre-filled from scan | 7's `mapScannedCardToLead` never sets it; Task 5's dropdown defaults to unselected via `RELATIONSHIP_TYPES`'s `''` member |
| Address parsing (street/city/state/zip, one-line and two-line) | 3 |
| Company via hand-copied `ENTITY`, not cross-repo import | 3 |
| Duplicate detection 3-tier order | 4 |
| 3-way duplicate dialog (Update/Create/Cancel) | 7 |
| Cancel returns to the live camera | 7 (`onCancel` reopens `scannerOpen`) |
| Reused `LeadFormDialog`/`LeadForm` as the review screen | 5, 7 |
| Never persist image/frame data | 6 (frames exist only as local `HTMLCanvasElement`s, never uploaded or stored) |
| Loading/error states, camera permission denial | 6 |
| "Still looking" hint after ~20-30s | 6 |
| Testing: pure logic tested, live camera/OCR not | 2, 3, 4, 7 (tests); 6 (explicitly not, per spec) |

**Placeholder scan:** clean. Every step has literal, complete code. Task 6's `npm view tesseract.js version` step is a deliberate resolve-at-implementation-time value (an exact version to pin), not a placeholder — the step names exactly what to do with the output.

**Type consistency:** `ParsedBusinessCard` (Task 3) and `mapScannedCardToLead`'s input (Task 7) share the same 13 field names. `Lead`'s 7 new fields (Task 1) are the exact names used in Task 5's form, Task 4's merge function, and Task 7's mapping — no field was renamed between tasks. `FormValues` is exported in Task 5 specifically because Task 5 itself (via `LeadFormDialog`) is the first consumer outside `LeadForm.tsx`.

**A sequencing note:** Task 6 (the scanner) and Tasks 2-4 (the pure logic modules) have no dependency on each other and could in principle run in parallel — Task 6 only depends on Task 2's `hasContactSignal`. Task 7 depends on all of Tasks 3, 4, 5, and 6 being complete, and is correctly last. Task 1 has no dependency on anything else and is correctly first, since Tasks 4, 5, and 7 all reference the fields it adds.
