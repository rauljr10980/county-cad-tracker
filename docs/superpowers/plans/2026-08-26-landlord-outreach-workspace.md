# Landlord Outreach Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the eviction landlord profile the screen a call is made from — per-line phone notes, attempt counts, right/wrong disposition, a separate email section, address-based research links, and a record of properties the landlord says they own.

**Architecture:** Pure logic — the contacts normaliser and the three research-URL builders — goes in dependency-free modules under `src/lib/` so it is unit testable. The profile UI in `EvictionLeadsView.tsx` consumes them. Owned properties are a new relational table with its own routes, mirroring how `EvictionAddress` already hangs off a landlord.

**Tech Stack:** Express (CommonJS), Prisma 5.22.0, PostgreSQL on Railway, Vite + React 18 + TypeScript + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-landlord-outreach-workspace-design.md`

## Global Constraints

- **`Phone.status` is the disposition field** — values `'right'`, `'wrong'`, or `''`. Do not add a second field. Do not repurpose `Phone.type`, which stays unused.
- **Attempts are an uncapped running count.** No retirement rule, no `n of 4`.
- **Pressing a number posts an `EvictionActivity` of kind `call`** so it flows through the existing stage machine that sets `lastContactedAt` and advances `New Lead` to `Contacted`.
- **Disposition is a separate action from dialling**, and is reversible.
- **A `wrong` number renders de-emphasised, never hidden.**
- **Every read of `contacts` goes through the normaliser.** Existing rows store emails as bare strings; a reader assuming the new shape throws on real data.
- Backend is CommonJS; frontend is ESM. `@/` maps to `src/`.
- **There is no local database.** Never run `prisma migrate deploy`, `prisma migrate dev`, or `prisma db push`. `prisma validate` and `prisma generate` need a `DATABASE_URL`; a dummy `postgresql://u:p@localhost:5432/db` works without connecting.
- **Schema changes reach production via `functions/start.sh` running `prisma db push`** — `prisma migrate deploy` never runs on this project.
- `@testing-library/jest-dom` is deliberately NOT installed. Use plain Vitest matchers on DOM properties.
- The repo has many pre-existing TypeScript errors in unrelated files; `npx tsc --noEmit` exits non-zero on a clean checkout. Judge with `npm run build`.
- Suite baseline is **70 tests across 9 files** on `main`. Build is green.
- Commit after every task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/contactsModel.ts` | **New.** Normalise the `contacts` JSON; pure helpers for attempts and disposition |
| `src/lib/contactsModel.test.ts` | **New.** Unit tests |
| `src/lib/researchLinks.ts` | **New.** Build the three research URLs |
| `src/lib/researchLinks.test.ts` | **New.** Unit tests, including the citystatezip bug |
| `functions/prisma/schema.prisma` | `EvictionOwnedProperty` model + landlord relation |
| `functions/src/routes/evictions.js` | Owned-property routes; include the relation in landlord reads |
| `src/crm/views/EvictionLeadsView.tsx` | Contacts split, call logging, research buttons, owned properties |

---

### Task 1: Contacts model and research links

Both are pure, dependency-free, and testable without a DOM or a database. They are one task because neither is worth its own review gate and they ship together.

**Files:**
- Create: `src/lib/contactsModel.ts`, `src/lib/contactsModel.test.ts`
- Create: `src/lib/researchLinks.ts`, `src/lib/researchLinks.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type PhoneEntry = { number: string; status?: string; type?: string; source?: string; note?: string; attempts?: number; lastAttemptAt?: string | null }`
  - `type EmailEntry = { address: string; note?: string }`
  - `type NormalizedContacts = { phoneRows: { name: string; phones: PhoneEntry[] }[]; emailRows: { name: string; emails: EmailEntry[] }[] }`
  - `normalizeContacts(raw: unknown): NormalizedContacts`
  - `recordAttempt(contacts, rowIndex, phoneIndex, now): NormalizedContacts`
  - `setDisposition(contacts, rowIndex, phoneIndex, status): NormalizedContacts`
  - `setPhoneNote(contacts, rowIndex, phoneIndex, note): NormalizedContacts`
  - `setEmailNote(contacts, rowIndex, emailIndex, note): NormalizedContacts`
  - `truePeopleSearchUrl({ address, city, state, zip })`
  - `taxAssessorUrl()`
  - `landRecordsUrl({ address })`

- [ ] **Step 1: Write the failing tests for the contacts model**

Create `src/lib/contactsModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeContacts,
  recordAttempt,
  setDisposition,
  setPhoneNote,
  setEmailNote,
} from './contactsModel';

const legacy = {
  phoneRows: [{ name: 'Petra Martinez', phones: [{ number: '(903) 714-4811', status: '', source: 'TruePeopleSearch' }] }],
  emailRows: [{ name: 'Petra Martinez', emails: ['petramartinez53@yahoo.com', '1953pmtz@gmail.com'] }],
};

describe('normalizeContacts', () => {
  it('turns legacy bare-string emails into entries', () => {
    const result = normalizeContacts(legacy);
    expect(result.emailRows[0].emails).toEqual([
      { address: 'petramartinez53@yahoo.com' },
      { address: '1953pmtz@gmail.com' },
    ]);
  });

  it('leaves already-normalised emails alone, keeping their notes', () => {
    const result = normalizeContacts({
      phoneRows: [],
      emailRows: [{ name: 'X', emails: [{ address: 'a@b.com', note: 'bounced' }] }],
    });
    expect(result.emailRows[0].emails).toEqual([{ address: 'a@b.com', note: 'bounced' }]);
  });

  it('defaults attempts to 0 on a phone that has never been called', () => {
    expect(normalizeContacts(legacy).phoneRows[0].phones[0].attempts).toBe(0);
  });

  it('survives null, undefined, and a missing key', () => {
    expect(normalizeContacts(null)).toEqual({ phoneRows: [], emailRows: [] });
    expect(normalizeContacts(undefined)).toEqual({ phoneRows: [], emailRows: [] });
    expect(normalizeContacts({})).toEqual({ phoneRows: [], emailRows: [] });
  });

  it('drops a phone with no number rather than rendering a blank line', () => {
    const result = normalizeContacts({ phoneRows: [{ name: 'X', phones: [{ number: '' }, { number: '555' }] }], emailRows: [] });
    expect(result.phoneRows[0].phones).toHaveLength(1);
  });
});

describe('recordAttempt', () => {
  it('increments the count and stamps the time', () => {
    const now = new Date('2026-08-26T15:00:00Z');
    const result = recordAttempt(normalizeContacts(legacy), 0, 0, now);
    expect(result.phoneRows[0].phones[0].attempts).toBe(1);
    expect(result.phoneRows[0].phones[0].lastAttemptAt).toBe('2026-08-26T15:00:00.000Z');
  });

  it('counts up across repeated calls', () => {
    const now = new Date('2026-08-26T15:00:00Z');
    let c = normalizeContacts(legacy);
    c = recordAttempt(c, 0, 0, now);
    c = recordAttempt(c, 0, 0, now);
    c = recordAttempt(c, 0, 0, now);
    expect(c.phoneRows[0].phones[0].attempts).toBe(3);
  });

  it('leaves other numbers untouched', () => {
    const two = normalizeContacts({
      phoneRows: [{ name: 'X', phones: [{ number: '111' }, { number: '222' }] }],
      emailRows: [],
    });
    const result = recordAttempt(two, 0, 1, new Date());
    expect(result.phoneRows[0].phones[0].attempts).toBe(0);
    expect(result.phoneRows[0].phones[1].attempts).toBe(1);
  });

  it('does not mutate the input', () => {
    const before = normalizeContacts(legacy);
    recordAttempt(before, 0, 0, new Date());
    expect(before.phoneRows[0].phones[0].attempts).toBe(0);
  });
});

describe('setDisposition', () => {
  it('records right, then wrong, ending at wrong', () => {
    let c = normalizeContacts(legacy);
    c = setDisposition(c, 0, 0, 'right');
    expect(c.phoneRows[0].phones[0].status).toBe('right');
    c = setDisposition(c, 0, 0, 'wrong');
    expect(c.phoneRows[0].phones[0].status).toBe('wrong');
  });

  it('clears back to undecided', () => {
    let c = setDisposition(normalizeContacts(legacy), 0, 0, 'wrong');
    c = setDisposition(c, 0, 0, '');
    expect(c.phoneRows[0].phones[0].status).toBe('');
  });

  it('does not change the attempt count', () => {
    const c = setDisposition(recordAttempt(normalizeContacts(legacy), 0, 0, new Date()), 0, 0, 'wrong');
    expect(c.phoneRows[0].phones[0].attempts).toBe(1);
  });
});

describe('notes', () => {
  it('sets a note on one phone line only', () => {
    const two = normalizeContacts({ phoneRows: [{ name: 'X', phones: [{ number: '111' }, { number: '222' }] }], emailRows: [] });
    const result = setPhoneNote(two, 0, 0, 'said he owns no rentals');
    expect(result.phoneRows[0].phones[0].note).toBe('said he owns no rentals');
    expect(result.phoneRows[0].phones[1].note).toBeUndefined();
  });

  it('sets a note on an email line', () => {
    const result = setEmailNote(normalizeContacts(legacy), 0, 1, 'bounced');
    expect(result.emailRows[0].emails[1].note).toBe('bounced');
    expect(result.emailRows[0].emails[0].note).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/contactsModel.test.ts`
Expected: FAIL — `Cannot find module './contactsModel'`.

- [ ] **Step 3: Write the contacts model**

Create `src/lib/contactsModel.ts`:

```ts
/**
 * The `contacts` column on an eviction landlord is an unvalidated JSON blob
 * written by several versions of this app. Emails were stored as bare strings
 * before per-line notes existed, so every read goes through normalizeContacts
 * — a reader that assumes the current shape throws on real rows.
 */

export type PhoneEntry = {
  number: string;
  status?: string;
  type?: string;
  source?: string;
  note?: string;
  attempts?: number;
  lastAttemptAt?: string | null;
};

export type EmailEntry = { address: string; note?: string };

export type NormalizedContacts = {
  phoneRows: { name: string; phones: PhoneEntry[] }[];
  emailRows: { name: string; emails: EmailEntry[] }[];
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizePhone = (raw: unknown): PhoneEntry | null => {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const number = typeof p.number === 'string' ? p.number.trim() : '';
  if (!number) return null;
  return {
    number,
    status: typeof p.status === 'string' ? p.status : '',
    type: typeof p.type === 'string' ? p.type : undefined,
    source: typeof p.source === 'string' ? p.source : undefined,
    note: typeof p.note === 'string' && p.note ? p.note : undefined,
    attempts: typeof p.attempts === 'number' && p.attempts > 0 ? p.attempts : 0,
    lastAttemptAt: typeof p.lastAttemptAt === 'string' ? p.lastAttemptAt : null,
  };
};

const normalizeEmail = (raw: unknown): EmailEntry | null => {
  if (typeof raw === 'string') {
    const address = raw.trim();
    return address ? { address } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const address = typeof e.address === 'string' ? e.address.trim() : '';
  if (!address) return null;
  return typeof e.note === 'string' && e.note ? { address, note: e.note } : { address };
};

export const normalizeContacts = (raw: unknown): NormalizedContacts => {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    phoneRows: asArray(source.phoneRows).map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: typeof r.name === 'string' ? r.name : '',
        phones: asArray(r.phones).map(normalizePhone).filter((p): p is PhoneEntry => p !== null),
      };
    }),
    emailRows: asArray(source.emailRows).map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: typeof r.name === 'string' ? r.name : '',
        emails: asArray(r.emails).map(normalizeEmail).filter((e): e is EmailEntry => e !== null),
      };
    }),
  };
};

// Every mutator returns a new object. The profile keeps the contacts blob in
// React state and PATCHes it whole, so in-place mutation would not re-render.
const mapPhone = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  change: (phone: PhoneEntry) => PhoneEntry
): NormalizedContacts => ({
  ...contacts,
  phoneRows: contacts.phoneRows.map((row, ri) =>
    ri !== rowIndex
      ? row
      : { ...row, phones: row.phones.map((phone, pi) => (pi === phoneIndex ? change(phone) : phone)) }
  ),
});

export const recordAttempt = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  now: Date
): NormalizedContacts =>
  mapPhone(contacts, rowIndex, phoneIndex, (phone) => ({
    ...phone,
    attempts: (phone.attempts ?? 0) + 1,
    lastAttemptAt: now.toISOString(),
  }));

export const setDisposition = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  status: string
): NormalizedContacts => mapPhone(contacts, rowIndex, phoneIndex, (phone) => ({ ...phone, status }));

export const setPhoneNote = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  note: string
): NormalizedContacts =>
  mapPhone(contacts, rowIndex, phoneIndex, (phone) => ({ ...phone, note: note || undefined }));

export const setEmailNote = (
  contacts: NormalizedContacts,
  rowIndex: number,
  emailIndex: number,
  note: string
): NormalizedContacts => ({
  ...contacts,
  emailRows: contacts.emailRows.map((row, ri) =>
    ri !== rowIndex
      ? row
      : {
          ...row,
          emails: row.emails.map((email, ei) =>
            ei === emailIndex ? { ...email, note: note || undefined } : email
          ),
        }
  ),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/contactsModel.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the failing tests for the research links**

Create `src/lib/researchLinks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { truePeopleSearchUrl, taxAssessorUrl, landRecordsUrl } from './researchLinks';

const addr = { address: '5726 Golf Heights', city: 'San Antonio', state: 'TX', zip: '78244' };

describe('truePeopleSearchUrl', () => {
  it('searches by address, not by name', () => {
    const url = new URL(truePeopleSearchUrl(addr));
    expect(url.pathname).toBe('/resultaddress');
    expect(url.searchParams.get('name')).toBeNull();
  });

  it('puts the street line in streetaddress and only the locality in citystatezip', () => {
    const url = new URL(truePeopleSearchUrl(addr));
    expect(url.searchParams.get('streetaddress')).toBe('5726 Golf Heights');
    expect(url.searchParams.get('citystatezip')).toBe('San Antonio, TX 78244');
  });

  it('does not leak the street line into citystatezip', () => {
    const citystatezip = new URL(truePeopleSearchUrl(addr)).searchParams.get('citystatezip') ?? '';
    expect(citystatezip).not.toContain('5726');
    expect(citystatezip).not.toContain('Golf Heights');
  });

  it('omits an empty locality rather than sending stray punctuation', () => {
    const url = new URL(truePeopleSearchUrl({ address: '1 Main', city: '', state: '', zip: '' }));
    expect(url.searchParams.get('citystatezip')).toBe('');
  });
});

describe('taxAssessorUrl', () => {
  it('points at the Bexar tax assessor', () => {
    expect(taxAssessorUrl()).toContain('bexar.acttax.com');
  });
});

describe('landRecordsUrl', () => {
  it('searches Bexar public records for the street', () => {
    const url = new URL(landRecordsUrl(addr));
    expect(url.hostname).toBe('bexar.tx.publicsearch.us');
    expect(url.searchParams.get('searchValue')).toBe('5726 Golf Heights');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/lib/researchLinks.test.ts`
Expected: FAIL — `Cannot find module './researchLinks'`.

- [ ] **Step 7: Write the research links**

Create `src/lib/researchLinks.ts`:

```ts
/**
 * Outbound research links for a single address.
 *
 * The previous TruePeopleSearch link was wrong twice: it searched by the
 * landlord's name, and it passed the entire street address as `citystatezip`.
 * Landlord names are also stored surname-first ("MARTINEZ, PETRA"), so a name
 * search needed flipping that never happened. Searching by address avoids both.
 */

export type ResearchAddress = { address: string; city?: string; state?: string; zip?: string };

const locality = ({ city, state, zip }: ResearchAddress): string => {
  const cityState = [city, state].filter(Boolean).join(', ');
  return [cityState, zip].filter(Boolean).join(' ').trim();
};

export const truePeopleSearchUrl = (addr: ResearchAddress): string => {
  const params = new URLSearchParams({
    streetaddress: addr.address,
    citystatezip: locality(addr),
  });
  return `https://www.truepeoplesearch.com/resultaddress?${params.toString()}`;
};

export const taxAssessorUrl = (): string =>
  'https://bexar.acttax.com/act_webdev/bexar/index.jsp';

export const landRecordsUrl = (addr: ResearchAddress): string => {
  const params = new URLSearchParams({
    department: 'RP',
    recordedDateRange: '18000101,20261231',
    searchType: 'quickSearch',
    searchValue: addr.address,
  });
  return `https://bexar.tx.publicsearch.us/results?${params.toString()}`;
};
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/researchLinks.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: 90 tests across 11 files (70 baseline + 14 + 6).

- [ ] **Step 10: Commit**

```bash
git add src/lib/contactsModel.ts src/lib/contactsModel.test.ts src/lib/researchLinks.ts src/lib/researchLinks.test.ts
git commit -m "Add contacts normaliser and address-based research links"
```

---

### Task 2: Owned properties table and routes

**Files:**
- Modify: `functions/prisma/schema.prisma` (`model EvictionLandlord`, add new model after `EvictionAddress`)
- Modify: `functions/src/routes/evictions.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `EvictionOwnedProperty` rows on the landlord detail response as `ownedProperties`
  - `POST /api/evictions/landlords/:id/owned-properties` → the created row
  - `DELETE /api/evictions/owned-properties/:id` → `{ ok: true }`
  - `ownedPropertyCount` on each row of `GET /landlords`

- [ ] **Step 1: Add the model**

In `functions/prisma/schema.prisma`, after `model EvictionAddress`, add:

```prisma
model EvictionOwnedProperty {
  id         String   @id @default(cuid())
  landlordId String
  address    String
  city       String   @default("")
  state      String   @default("")
  zip        String   @default("")
  notes      String   @default("") @db.Text
  createdAt  DateTime @default(now())

  landlord EvictionLandlord @relation(fields: [landlordId], references: [id], onDelete: Cascade)

  @@index([landlordId])
  @@map("eviction_owned_properties")
}
```

In `model EvictionLandlord`, add to the relations block alongside `addresses`:

```prisma
  ownedProperties EvictionOwnedProperty[]
```

- [ ] **Step 2: Verify the schema**

```bash
cd functions
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate
```

Expected: valid, and `Generated Prisma Client`. Do NOT run `db push` or any `migrate` command — there is no local database, and production picks the schema up through `start.sh`.

- [ ] **Step 3: Include owned properties in the landlord detail read**

In `functions/src/routes/evictions.js`, the `GET /landlords/:id` route (around line 499) builds an `include`. Add to it:

```js
      ownedProperties: { orderBy: { createdAt: 'asc' } },
```

- [ ] **Step 4: Add the count to the list read**

In the `GET /landlords` route (around line 492), the `include` has `_count: { select: { filings: true, addresses: true } }`. Change that select to:

```js
        _count: { select: { filings: true, addresses: true, ownedProperties: true } },
```

Then, wherever that route maps rows to its response shape, expose the count as `ownedPropertyCount` alongside the existing `filingCount` and `addressCount`. Follow whatever naming the surrounding mapping already uses — read it rather than guessing.

- [ ] **Step 5: Add the write routes**

In `functions/src/routes/evictions.js`, near the other `/landlords/:id/...` POST routes (around line 445), add:

```js
router.post('/landlords/:id/owned-properties', async (req, res) => {
  const address = clean(req.body.address);
  if (!address) return res.status(400).json({ error: 'An address is required' });
  res.json(await prisma.evictionOwnedProperty.create({
    data: {
      landlordId: req.params.id,
      address,
      city: clean(req.body.city) || '',
      state: clean(req.body.state) || '',
      zip: clean(req.body.zip) || '',
      notes: clean(req.body.notes) || '',
    },
  }));
});

router.delete('/owned-properties/:id', async (req, res) => {
  await prisma.evictionOwnedProperty.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
```

`clean` is the existing helper in this file — check its behaviour before relying on it for the required-address check.

- [ ] **Step 6: Verify**

```bash
node --check functions/src/routes/evictions.js
npm test
```

Expected: `node --check` exits 0. Suite unchanged at 90 across 11 files — this task adds no tests, because its logic needs a live database and there is none. Do not invent database-backed tests.

- [ ] **Step 7: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/routes/evictions.js
git commit -m "Add owned properties to eviction landlords"
```

---

### Task 3: The outreach profile UI

**Files:**
- Modify: `src/crm/views/EvictionLeadsView.tsx`

**Interfaces:**
- Consumes from Task 1: `normalizeContacts`, `recordAttempt`, `setDisposition`, `setPhoneNote`, `setEmailNote`, `truePeopleSearchUrl`, `taxAssessorUrl`, `landRecordsUrl`, and the `PhoneEntry` / `EmailEntry` / `NormalizedContacts` types
- Consumes from Task 2: `ownedProperties` on the detail response, the two write routes, `ownedPropertyCount` on list rows
- Produces: the finished profile

Existing helpers in this file you will use: `patch(data)` PATCHes the landlord and refreshes (line 90), `request(path, init)` calls the API, `open(id)` reloads the selected landlord, `addActivity` posts an activity (line 152).

- [ ] **Step 1: Replace the local Contacts types with the shared ones**

The file declares `type Phone` (line 8) and `type Contacts` (line 9) locally. Delete both and import from `@/lib/contactsModel` instead, updating the `Detail` type's `contacts` field to `NormalizedContacts`. Add `ownedProperties` to `Detail`:

```ts
  ownedProperties?: { id: string; address: string; city: string; state: string; zip: string; notes: string }[];
```

- [ ] **Step 2: Normalise on read**

Wherever the selected landlord is set from the API, pass its `contacts` through `normalizeContacts`. This is the single entry point the spec requires — a landlord saved before this change stores emails as bare strings and will throw otherwise.

- [ ] **Step 3: Replace the Contacts section**

Replace the single Contacts `<section>` (around line 286) with two sections. Phones:

```tsx
      <section className="rounded border bg-card p-3.5 space-y-2">
        <h3 className="text-base font-semibold">Phone Numbers</h3>
        {!selected.contacts.phoneRows.some((r) => r.phones.length) && (
          <p className="text-sm text-muted-foreground">No phone numbers yet. Paste a TruePeopleSearch result above to extract them.</p>
        )}
        {selected.contacts.phoneRows.map((row, ri) => row.phones.map((phone, pi) => (
          <div key={`${ri}-${pi}`} className={`grid gap-2 md:grid-cols-[minmax(0,180px)_auto_auto_minmax(0,1fr)] items-center ${phone.status === 'wrong' ? 'opacity-50' : ''}`}>
            <button
              className="text-left text-primary record hover:underline"
              onClick={() => callNumber(ri, pi, phone.number)}
            >
              {phone.number}
            </button>
            <span className="text-xs text-muted-foreground record" title="Call attempts">
              {phone.attempts ? `${phone.attempts} tried` : 'not tried'}
            </span>
            <span className="flex gap-1">
              <button
                className={`rounded border px-2 py-1 text-xs ${phone.status === 'right' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                aria-pressed={phone.status === 'right'}
                onClick={() => disposition(ri, pi, phone.status === 'right' ? '' : 'right')}
              >Right number</button>
              <button
                className={`rounded border px-2 py-1 text-xs ${phone.status === 'wrong' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                aria-pressed={phone.status === 'wrong'}
                onClick={() => disposition(ri, pi, phone.status === 'wrong' ? '' : 'wrong')}
              >Wrong number</button>
            </span>
            <input
              className="h-9 w-full rounded border bg-card px-2 text-sm"
              placeholder="Note for this number"
              defaultValue={phone.note || ''}
              onBlur={(e) => phoneNote(ri, pi, e.target.value)}
            />
          </div>
        )))}
      </section>
```

Emails:

```tsx
      <section className="rounded border bg-card p-3.5 space-y-2">
        <h3 className="text-base font-semibold">Emails</h3>
        {!selected.contacts.emailRows.some((r) => r.emails.length) && (
          <p className="text-sm text-muted-foreground">No emails yet.</p>
        )}
        {selected.contacts.emailRows.map((row, ri) => row.emails.map((email, ei) => (
          <div key={`${ri}-${ei}`} className="grid gap-2 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] items-center">
            <a className="text-primary" href={`mailto:${email.address}`}>{email.address}</a>
            <input
              className="h-9 w-full rounded border bg-card px-2 text-sm"
              placeholder="Note for this email"
              defaultValue={email.note || ''}
              onBlur={(e) => emailNote(ri, ei, e.target.value)}
            />
          </div>
        )))}
      </section>
```

Note `defaultValue` with `onBlur` rather than `value` with `onChange`: each keystroke would otherwise PATCH the landlord.

- [ ] **Step 4: Add the four contact handlers**

Add alongside the other handlers:

```tsx
  const saveContacts = async (contacts: NormalizedContacts) => { await patch({ contacts }); };

  const callNumber = async (ri: number, pi: number, number: string) => {
    if (!selected) return;
    window.open(`tel:${number}`, '_self');
    await saveContacts(recordAttempt(selected.contacts, ri, pi, new Date()));
    await request(`/landlords/${selected.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'call', body: `Called ${number}` }),
    });
    await patch({
      lastContactedAt: new Date().toISOString(),
      contactStage: selected.contactStage === 'New Lead' ? 'Contacted' : selected.contactStage,
    });
    await open(selected.id);
  };

  const disposition = (ri: number, pi: number, status: string) =>
    selected && saveContacts(setDisposition(selected.contacts, ri, pi, status));

  const phoneNote = (ri: number, pi: number, note: string) =>
    selected && saveContacts(setPhoneNote(selected.contacts, ri, pi, note));

  const emailNote = (ri: number, ei: number, note: string) =>
    selected && saveContacts(setEmailNote(selected.contacts, ri, ei, note));
```

- [ ] **Step 5: Replace the research button with three per-address buttons**

Delete the `truePeopleSearch` function (around line 148) and the single "Open search" button in the extractor header (around line 279). In the addresses block (around line 309), replace each address row with the address plus its three links:

```tsx
        <div className="grid md:grid-cols-2 gap-2">{selected.addresses.map((a) => (
          <div key={a.id} className="rounded bg-muted p-2 text-sm space-y-2">
            <p className="record">{a.address}, {a.city}, {a.state} {a.zip}</p>
            <div className="flex flex-wrap gap-1.5">
              <a className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs hover:bg-background" href={truePeopleSearchUrl(a)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>People search</a>
              <a className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs hover:bg-background" href={taxAssessorUrl()} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>Tax assessor</a>
              <a className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs hover:bg-background" href={landRecordsUrl(a)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>Land records</a>
            </div>
          </div>
        ))}</div>
```

- [ ] **Step 6: Add the owned-properties card**

Add a new section after the addresses block, with local state for the form fields:

```tsx
      <section className="rounded border bg-card p-3.5 space-y-3">
        <h3 className="text-base font-semibold">Properties They Own</h3>
        <p className="text-xs text-muted-foreground">Recorded from what the landlord tells you. The addresses above are where their mail goes, not what they own.</p>
        {!(selected.ownedProperties || []).length && (
          <p className="text-sm text-muted-foreground">None recorded yet.</p>
        )}
        {(selected.ownedProperties || []).map((p) => (
          <div key={p.id} className="flex items-start justify-between gap-2 rounded bg-muted p-2">
            <div>
              <p className="record text-sm">{[p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')}</p>
              {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
            </div>
            <button className="rounded border bg-card px-2 py-1 text-xs hover:bg-background" onClick={() => removeOwnedProperty(p.id)}>Remove</button>
          </div>
        ))}
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_60px_90px_auto]">
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="Address" value={opAddress} onChange={(e) => setOpAddress(e.target.value)}/>
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="City" value={opCity} onChange={(e) => setOpCity(e.target.value)}/>
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="ST" value={opState} onChange={(e) => setOpState(e.target.value)}/>
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="ZIP" value={opZip} onChange={(e) => setOpZip(e.target.value)}/>
          <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none" onClick={addOwnedProperty} disabled={!opAddress.trim()}>Add</button>
        </div>
        <input className="h-9 w-full rounded border bg-card px-2 text-sm" placeholder="Notes about this property" value={opNotes} onChange={(e) => setOpNotes(e.target.value)}/>
      </section>
```

with handlers:

```tsx
  const addOwnedProperty = async () => {
    if (!selected || !opAddress.trim()) return;
    await request(`/landlords/${selected.id}/owned-properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: opAddress, city: opCity, state: opState, zip: opZip, notes: opNotes }),
    });
    setOpAddress(''); setOpCity(''); setOpState(''); setOpZip(''); setOpNotes('');
    await open(selected.id);
  };

  const removeOwnedProperty = async (id: string) => {
    if (!selected) return;
    await request(`/owned-properties/${id}`, { method: 'DELETE' });
    await open(selected.id);
  };
```

- [ ] **Step 7: Add the PROPERTIES column to the leads table**

Add a `PROPERTIES` header and a cell rendering `ownedPropertyCount` with the `.record` class, following the existing numeric columns in that table.

- [ ] **Step 8: Verify**

```bash
npm test
npm run build
```

Expected: 90 tests across 11 files, build exits 0. This task adds no tests — its logic lives in Task 1's tested modules, and the rest is rendering.

- [ ] **Step 9: Commit**

```bash
git add src/crm/views/EvictionLeadsView.tsx
git commit -m "Rebuild the landlord profile as an outreach workspace"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Per-phone note | 1 (`setPhoneNote`) + 3 (UI) |
| Attempt count, uncapped | 1 (`recordAttempt`) + 3 |
| Right/wrong disposition, reversible, reusing `status` | 1 (`setDisposition`) + 3 |
| Pressing a number posts a `call` activity | 3 (`callNumber`) |
| `wrong` renders de-emphasised, not hidden | 3 (`opacity-50`) |
| Separate email section with notes | 1 (`setEmailNote`) + 3 |
| Legacy bare-string emails tolerated | 1 (`normalizeContacts`) |
| TruePeopleSearch by address, `citystatezip` fixed | 1 (`truePeopleSearchUrl`) |
| Tax assessor and land records links | 1 + 3 |
| Links act per-address | 3 (Step 5) |
| `EvictionOwnedProperty` table | 2 |
| Owned properties entered by hand | 3 (Step 6) |
| `PROPERTIES` count column | 2 (count) + 3 (render) |

**Placeholder scan:** clean, with one deliberate exception — Task 2 Step 4 says to follow the existing response mapping's naming rather than quoting it, because that mapping was not read while writing this plan. The implementer must read it. Everywhere else the code is complete.

**Type consistency:** `NormalizedContacts`, `PhoneEntry`, and `EmailEntry` are defined in Task 1 and imported by name in Task 3. The five mutators all take `(contacts, rowIndex, index, ...)` in that order. `truePeopleSearchUrl` and `landRecordsUrl` both take a `ResearchAddress`, which the `addresses` array elements structurally satisfy.

**Test counts:** Task 1 adds 20 (14 + 6) for a total of 90 across 11 files. Tasks 2 and 3 add none, and both say so explicitly so no implementer invents database-backed tests.

**A gap worth naming:** `callNumber` issues a PATCH for contacts, a POST for the activity, and a second PATCH for the stage — three round trips, and a failure between them leaves the attempt recorded without the activity. Accepted for now: the attempt count is the part being protected, and a landlord-level activity feed that disagrees with a per-line count by one is visible and self-correcting. Worth collapsing into a single endpoint if it proves annoying.
