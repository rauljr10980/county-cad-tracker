# Custom MLS Leads — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the MLS lead list into something worked from — look the current owner up from Bexar CAD, resolve entity owners through the Texas Comptroller, and give each lead a details view shaped like the Properties modal.

**Architecture:** Two lookup clients, each a module with its own tests and no Prisma import, behind routes that persist their results onto `MlsLead` and `MlsContact`. The details view is rebuilt in the shape of `PropertyDetailsModal` — an Actions row, an address block, and collapsible sections — with the tax sections fed by the CAD lookup.

**Tech Stack:** Express (CommonJS), Prisma 5.22.0, PostgreSQL on Railway, Vite + React 18 + TypeScript + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-custom-mls-leads-design.md`

## What Phase 1 already built

`MlsLead` and `MlsContact` models, the workbook parser, owner classification (`classifyOwner`, `searchName`), the import route, the working list, and a basic details dialog. `MlsLead` already carries `cadLookupAt` and `cadLookupStatus`, unused so far.

## Global Constraints

- **The Comptroller key is read from `process.env.COMPTROLLER_API_KEY` and never committed.** It is set in Railway. Code must degrade to a clear error when it is absent, not crash and not silently no-op.
- **Verified API contract** (probed without a key; AWS API Gateway answers `Forbidden` for a real route and `Missing Authentication Token` for one that does not exist):
  - `GET https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax/{taxpayerId}` — exists
  - `GET https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax/search` — exists
  - `/name/…`, `/entity-name/…`, `/search/{term}`, `/file-number/…`, `/taxpayer-id/…` — do **not** exist
- **The search query parameter name and the response shape are NOT verified** — they could not be read without a key. Build them configurable and log the raw response on an unexpected shape. Do not invent field names in silence.
- **The API key header defaults to `x-api-key`**, the AWS API Gateway convention, and is overridable by `COMPTROLLER_API_KEY_HEADER`.
- **Comptroller lookup runs only for contacts whose `nameKind` is `entity`.** A person is not a franchise taxpayer, and searching one wastes a call.
- **CAD lookup runs only for `county === 'Bexar'`.** Every other county gets `cadLookupStatus = 'unsupported_county'` rather than being attempted or left at `pending` forever — 384 of 2,321 listings are outside Bexar.
- **Sold-in-Bexar rows are looked up first.** They are the two-sided leads the feature exists for.
- **The Comptroller returns no officer or registered-agent names.** An entity resolves to a mailing address, never to a person. Do not label it as an owner name in the UI.
- Backend is CommonJS; frontend is ESM. `@/` → `src/`.
- **There is no local database.** Never run `prisma db push`, `prisma migrate dev`, or `prisma migrate deploy`.
- `@testing-library/jest-dom` is deliberately NOT installed.
- Pre-existing TypeScript errors exist in unrelated files; judge with `npm run build`.
- Suite baseline is **165 tests across 18 files**.
- Commit after every task.

---

### Task 1: The Comptroller client

**Files:**
- Create: `functions/src/lib/comptroller.js`, `functions/src/lib/comptroller.test.js`

**Interfaces:**
- Produces: `searchEntity(name, { fetchImpl, apiKey, param })` → `{ ok, results, error }`; `normalizeEntity(raw)` → a flat record; `COMPTROLLER_BASE`

- [ ] **Step 1: Write the failing test**

Create `functions/src/lib/comptroller.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { searchEntity, normalizeEntity, COMPTROLLER_BASE } from './comptroller.js';

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status, body) => async () => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });

describe('searchEntity', () => {
  it('refuses without an API key rather than calling out', async () => {
    let called = false;
    const result = await searchEntity('Baabco Properties II LLC', {
      apiKey: '',
      fetchImpl: async () => { called = true; },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/COMPTROLLER_API_KEY/);
    expect(called).toBe(false);
  });

  it('refuses an empty name', async () => {
    const result = await searchEntity('  ', { apiKey: 'k', fetchImpl: async () => { throw new Error('should not run'); } });
    expect(result.ok).toBe(false);
  });

  it('sends the key in the header and the name in the query', async () => {
    let seenUrl = '';
    let seenHeaders = {};
    await searchEntity('Baabco Properties II LLC', {
      apiKey: 'secret',
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenHeaders = init.headers;
        return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{}' };
      },
    });
    expect(seenUrl.startsWith(`${COMPTROLLER_BASE}/search`)).toBe(true);
    expect(seenUrl).toContain('Baabco');
    expect(seenHeaders['x-api-key']).toBe('secret');
  });

  it('honours an overridden query parameter name', async () => {
    let seenUrl = '';
    await searchEntity('Acme LLC', {
      apiKey: 'k',
      param: 'entityName',
      fetchImpl: async (url) => { seenUrl = url; return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; },
    });
    expect(seenUrl).toContain('entityName=');
  });

  it('reports an auth failure without leaking the key', async () => {
    const result = await searchEntity('Acme LLC', {
      apiKey: 'supersecret',
      fetchImpl: fail(403, { message: 'Forbidden' }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
    expect(JSON.stringify(result)).not.toContain('supersecret');
  });

  it('returns results from any of the shapes the API might use', async () => {
    const row = { taxpayerNumber: '32096713030', taxpayerName: 'ACME LLC' };
    for (const body of [{ data: [row] }, { results: [row] }, [row]]) {
      const result = await searchEntity('ACME', { apiKey: 'k', fetchImpl: ok(body) });
      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(1);
    }
  });

  it('treats an unrecognised shape as no results, not as a crash', async () => {
    const result = await searchEntity('ACME', { apiKey: 'k', fetchImpl: ok({ unexpected: true }) });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });
});

describe('normalizeEntity', () => {
  it('maps camelCase fields', () => {
    expect(normalizeEntity({
      taxpayerNumber: '32096713030', taxpayerName: 'ACME LLC',
      taxpayerAddress: '1 MAIN ST', taxpayerCity: 'SAN ANTONIO',
      taxpayerState: 'TX', taxpayerZip: '78201',
    })).toEqual({
      taxpayerNumber: '32096713030', name: 'ACME LLC',
      address: '1 MAIN ST', city: 'SAN ANTONIO', state: 'TX', zip: '78201',
      fileNumber: '', status: '',
    });
  });

  it('maps the snake_case field names the open dataset uses', () => {
    const result = normalizeEntity({
      taxpayer_number: '1', taxpayer_name: 'B LLC', taxpayer_address: '2 OAK',
      taxpayer_city: 'AUSTIN', taxpayer_state: 'TX', taxpayer_zip: '78701',
      secretary_of_state_sos_or_coa_file_number: '0801',
    });
    expect(result.name).toBe('B LLC');
    expect(result.fileNumber).toBe('0801');
  });

  it('never returns undefined for a missing field', () => {
    const result = normalizeEntity({});
    Object.values(result).forEach((value) => expect(typeof value).toBe('string'));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/src/lib/comptroller.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `functions/src/lib/comptroller.js`:

```js
/**
 * Texas Comptroller franchise-tax lookup, used to resolve an entity owner
 * ("Baabco Properties II LLC") to a mailing address.
 *
 * It does NOT return officers or a registered agent — no such field exists on
 * this API or on the open data portal. An entity resolves to an address, which
 * for a small landlord LLC is usually the owner's home, CPA, or attorney, and
 * is then fed to the address-based people search. Two hops by nature.
 *
 * The two routes below were confirmed to exist by probing without a key: AWS
 * API Gateway answers "Forbidden" for a real route and "Missing Authentication
 * Token" for one that does not exist. The search query parameter name and the
 * response shape could NOT be confirmed that way, so both are handled
 * defensively and the raw body is logged when it does not match.
 */

const COMPTROLLER_BASE = 'https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax';
const DEFAULT_PARAM = 'name';
const DEFAULT_HEADER = 'x-api-key';

const str = (value) => (value == null ? '' : String(value).trim());

const normalizeEntity = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const pick = (...keys) => {
    for (const key of keys) if (row[key] != null) return str(row[key]);
    return '';
  };
  return {
    taxpayerNumber: pick('taxpayerNumber', 'taxpayer_number'),
    name: pick('taxpayerName', 'taxpayer_name'),
    address: pick('taxpayerAddress', 'taxpayer_address'),
    city: pick('taxpayerCity', 'taxpayer_city'),
    state: pick('taxpayerState', 'taxpayer_state'),
    zip: pick('taxpayerZip', 'taxpayer_zip'),
    fileNumber: pick('fileNumber', 'secretary_of_state_sos_or_coa_file_number'),
    status: pick('status', 'right_to_transact_business_code'),
  };
};

// The API's envelope is unverified, so accept the three plausible shapes and
// treat anything else as empty rather than throwing on a live lookup.
const extractRows = (body) => {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  if (body && Array.isArray(body.results)) return body.results;
  return null;
};

const searchEntity = async (name, options = {}) => {
  const {
    apiKey = process.env.COMPTROLLER_API_KEY || '',
    fetchImpl = fetch,
    param = process.env.COMPTROLLER_SEARCH_PARAM || DEFAULT_PARAM,
    header = process.env.COMPTROLLER_API_KEY_HEADER || DEFAULT_HEADER,
  } = options;

  const term = str(name);
  if (!apiKey) return { ok: false, results: [], error: 'COMPTROLLER_API_KEY is not set' };
  if (!term) return { ok: false, results: [], error: 'An entity name is required' };

  const url = `${COMPTROLLER_BASE}/search?${new URLSearchParams({ [param]: term })}`;

  try {
    const res = await fetchImpl(url, { headers: { [header]: apiKey, Accept: 'application/json' } });
    if (!res.ok) {
      // Deliberately does not include the key or the header value.
      return { ok: false, results: [], error: `Comptroller lookup failed (${res.status})` };
    }
    const body = await res.json();
    const rows = extractRows(body);
    if (!rows) {
      console.warn('[COMPTROLLER] unrecognised response shape:', JSON.stringify(body).slice(0, 400));
      return { ok: true, results: [] };
    }
    return { ok: true, results: rows.map(normalizeEntity) };
  } catch (err) {
    return { ok: false, results: [], error: err instanceof Error ? err.message : 'Comptroller lookup failed' };
  }
};

module.exports = { searchEntity, normalizeEntity, COMPTROLLER_BASE };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run functions/src/lib/comptroller.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 175 across 19 files.

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/comptroller.js functions/src/lib/comptroller.test.js
git commit -m "Add the Texas Comptroller entity lookup client"
```

---

### Task 2: Lookup routes

**Files:**
- Modify: `functions/prisma/schema.prisma` (`MlsContact` gains Comptroller fields)
- Modify: `functions/src/routes/mlsLeads.js`

**Interfaces:**
- Consumes: `searchEntity` from Task 1; `lookupOwner`-style helpers from `functions/src/lib/ownerLookup.js`
- Produces: `POST /api/mls-leads/:id/cad-lookup`, `POST /api/mls-leads/contacts/:contactId/entity-lookup`

- [ ] **Step 1: Extend `MlsContact`**

In `functions/prisma/schema.prisma`, add to `model MlsContact`:

```prisma
  entityTaxpayerNumber String    @default("")
  entityFileNumber     String    @default("")
  entityStatus         String    @default("")
  entityLookupAt       DateTime?
  entityLookupStatus   String?
```

Verify with `prisma validate` and `prisma generate` using a dummy `DATABASE_URL`. Do NOT run `db push` or any migrate command.

- [ ] **Step 2: Add the CAD lookup route**

In `functions/src/routes/mlsLeads.js`, add a route that looks the current owner up from Bexar CAD for one lead, reusing `functions/src/lib/ownerLookup.js` exactly as the Pre-Foreclosure feature calls it — read `functions/src/routes/preforeclosure.js` for how it invokes that module and follow it rather than inventing a second calling convention.

It must:
- refuse with `400` when the lead's `county` is not `Bexar`, and set `cadLookupStatus = 'unsupported_county'`
- search by the lead's street `address`
- on success, upsert an `MlsContact` with `role: 'cad_owner'`, its `name`, `nameKind` from `classifyOwner`, `searchName`, and the returned `mailingAddress`
- **create no second contact when the returned name matches the existing `mls_owner` name** — one person, not two records of them
- set `cadLookupAt` and `cadLookupStatus` in every outcome, including failure

- [ ] **Step 3: Add the entity lookup route**

Add a route taking a contact id that:
- returns `400` if the contact's `nameKind` is not `entity` — a person is not a franchise taxpayer
- calls `searchEntity(contact.name)`
- on a single confident result, writes `mailingAddress`, `entityTaxpayerNumber`, `entityFileNumber`, `entityStatus`, `entityLookupAt`, and `entityLookupStatus = 'success'`
- on multiple results, returns them for the user to choose and sets `entityLookupStatus = 'ambiguous'` without guessing
- on none, sets `'not_found'`; on an error, `'failed'` with the message surfaced

- [ ] **Step 4: Verify**

```bash
node --check functions/src/routes/mlsLeads.js
npm test
```

Expected: check exits 0; suite unchanged at 175 across 19 files. This task adds no tests — the client is tested in Task 1 and the rest needs a live database and a live county site.

- [ ] **Step 5: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/routes/mlsLeads.js
git commit -m "Add CAD and Comptroller lookup routes for MLS leads"
```

---

### Task 3: The details view

**Files:**
- Modify: `src/components/mls/MlsLeadDetails.tsx`

**Interfaces:**
- Consumes: the two lookup routes from Task 2

- [ ] **Step 1: Rebuild in the Properties modal's shape**

`src/components/properties/PropertyDetailsModal.tsx` is the reference. Match its structure — read it, do not copy it wholesale:

- a title row with the address and a status pill
- an **Actions** row of icon buttons: open in maps, people search by address, land records, tax assessor, and a "Look up owner" button that calls the CAD route
- the address block: the MLS address, plus the CAD mailing address once known, clearly labelled as the mailing address rather than the property
- **Legal Description** and **Owner**, as that modal has them
- collapsible sections below, matching its visual treatment

- [ ] **Step 2: Keep all 30 columns reachable**

Phase 1's details view renders all 30 source columns and that must not regress. Fold them into the collapsible sections — Property, County, Agents — rather than dropping any. Blank fields still render `—`.

- [ ] **Step 3: Add the lookup controls**

- a **Look up owner** button per lead, disabled when `county !== 'Bexar'` with the reason shown, calling the CAD route and refreshing on completion
- a **Look up business** button on any contact whose `nameKind` is `entity`, calling the entity route
- render `entityLookupStatus` plainly: `ambiguous` shows the candidates to pick from, `not_found` says so, `failed` shows the error
- label the Comptroller result **mailing address**, never "owner" — it does not name a person

- [ ] **Step 4: Verify**

```bash
npm test
npm run build
```

Expected: 175 across 19 files, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/mls/MlsLeadDetails.tsx
git commit -m "Rebuild the MLS details view with lookups"
```

---

## Deployment note

`COMPTROLLER_API_KEY` must be set in Railway before entity lookup works. Until then the route returns a clear "COMPTROLLER_API_KEY is not set" rather than failing obscurely — that is the intended behaviour, not a bug to work around.

If the Comptroller search returns an unexpected shape, `comptroller.js` logs the first 400 characters of the body. That log is how the unverified query-parameter name and response envelope get confirmed against the real API. Check it after the first live lookup, and set `COMPTROLLER_SEARCH_PARAM` if `name` turns out to be wrong.

## Self-Review

**Coverage:** Comptroller client (T1), both lookup routes (T2), details view with the Actions row and lookup controls (T3), CAD data feeding the tax sections (T2 → T3).

**Placeholder scan:** Tasks 2 and 3 describe routes and views as requirements rather than complete code, deliberately — both must follow existing files (`preforeclosure.js` for the lookup convention, `PropertyDetailsModal.tsx` for the layout) that an implementer has to read anyway. Every field, status value, and behaviour is named.

**The honest risk:** the Comptroller search parameter name and response shape are unverified. Task 1's tests cover three plausible envelopes and an unrecognised one, and the module logs what it actually receives — so the first live call diagnoses itself rather than failing silently. This is the part most likely to need a one-line correction after the key is set.
