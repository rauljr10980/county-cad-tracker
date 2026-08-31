# Custom MLS Leads — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the 2,321 connectMLS multifamily listings into the app as a worked lead list — imported, filterable, openable — so the CRM workflow can be applied to them.

**Architecture:** Owner classification and name normalisation are pure, dependency-free modules under `functions/src/lib/`, unit tested without a database. `MlsLead` holds the listing; `MlsContact` holds the people, because a sold property has two worth calling. The import parses `.XLS` with the `xlsx` dependency already in the repo.

**Tech Stack:** Express (CommonJS), Prisma 5.22.0, PostgreSQL on Railway, Vite + React 18 + TypeScript + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-custom-mls-leads-design.md`

## Phase boundary

**In Phase 1:** the models, owner classification, the importer, the filterable working list, and the details view.

**Deferred to Phase 2**, and deliberately not stubbed here: the Bexar CAD owner lookup, the Comptroller entity lookup, and the workflow-stage engine with follow-ups. `MlsContact.workflowStage` is stored with a default and rendered, but no transition UI exists yet.

## Global Constraints

- **All 30 source columns are stored and shown.** A column that looks useless while writing the importer is the one wanted while working a lead, and recovering it later means a re-import.
- **Dedupe on `MLS#`**, first occurrence wins. The four exports overlap by 150 rows across 2,471 total.
- **`@@unique([userId, mlsNumber])`** — not a global unique. Two accounts importing the same export must each own their copy.
- **Status transitions are recorded, not overwritten.** On re-import, a changed status sets `previousStatus` and `statusChangedAt` before writing the new one. An `ACT` → `SLD` move is the buy signal the feature exists to catch.
- **Owner classification is a pure function** returning `person`, `entity`, `junk`, `addressLike`, or `blank`. Order matters: `junk` is tested before `addressLike`, so `"See 123 Main"` is junk.
- **`mlsOwnerRaw` is always retained**, even when it classifies as junk, so a corrected classifier can be re-run without re-importing.
- **Contacts are created only for `person` and `entity`.**
- **`price` is `LP/SP`** — list price on active rows, sale price on sold ones. Stored once, labelled by status in the UI.
- Backend is CommonJS; frontend is ESM. `@/` → `src/`.
- **There is no local database.** Never run `prisma db push`, `prisma migrate dev`, or `prisma migrate deploy`. `prisma validate` and `prisma generate` need a `DATABASE_URL`; a dummy `postgresql://u:p@localhost:5432/db` works without connecting.
- Schema reaches production through `functions/start.sh` running `prisma db push`.
- `@testing-library/jest-dom` is deliberately NOT installed.
- Pre-existing TypeScript errors exist in unrelated files; `npx tsc --noEmit` exits non-zero on a clean checkout. Judge with `npm run build`.
- Suite baseline is **146 tests across 16 files**.
- Commit after every task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `functions/src/lib/mlsOwner.js` | **New.** Owner classification and name normalisation |
| `functions/src/lib/mlsOwner.test.js` | **New.** Unit tests |
| `functions/src/lib/mlsWorkbook.js` | **New.** Parse a connectMLS sheet into rows; dedupe |
| `functions/src/lib/mlsWorkbook.test.js` | **New.** Unit tests |
| `functions/prisma/schema.prisma` | `MlsLead`, `MlsContact` |
| `functions/src/routes/mlsLeads.js` | **New.** Import, list, detail, hide |
| `functions/src/index.js` | Mount the router |
| `src/components/mls/MlsLeadsView.tsx` | **New.** The working list |
| `src/components/mls/MlsLeadDetails.tsx` | **New.** The details view |
| `src/components/layout/navItems.ts` | The `Custom MLS Leads` tab |
| `src/pages/Index.tsx` | Route the tab |

---

### Task 1: Owner classification and name normalisation

**Files:**
- Create: `functions/src/lib/mlsOwner.js`, `functions/src/lib/mlsOwner.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `classifyOwner(raw)` → `'person' | 'entity' | 'junk' | 'addressLike' | 'blank'`; `searchName(raw)` → string

- [ ] **Step 1: Write the failing test**

Create `functions/src/lib/mlsOwner.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyOwner, searchName } from './mlsOwner.js';

describe('classifyOwner', () => {
  it('recognises a person', () => {
    expect(classifyOwner('Baugher Jason E')).toBe('person');
    expect(classifyOwner('Harrison Phillip L')).toBe('person');
  });

  it('recognises an entity by its suffix', () => {
    expect(classifyOwner('Baabco Properties II LLC')).toBe('entity');
    expect(classifyOwner('Romana Property LLC')).toBe('entity');
    expect(classifyOwner('Redbud Lane New Braunfels LLC')).toBe('entity');
  });

  it('recognises agent instructions as junk', () => {
    expect(classifyOwner('See Offer Instructions')).toBe('junk');
    expect(classifyOwner('see agent')).toBe('junk');
    expect(classifyOwner('See Broker')).toBe('junk');
    expect(classifyOwner('private owner (LREA)')).toBe('junk');
    expect(classifyOwner('yep')).toBe('junk');
    expect(classifyOwner('N/A')).toBe('junk');
  });

  it('recognises an address in the owner field', () => {
    expect(classifyOwner('804 Station Street')).toBe('addressLike');
  });

  it('treats junk as junk even when it contains digits', () => {
    expect(classifyOwner('See 123 Main')).toBe('junk');
  });

  it('recognises blank and near-blank', () => {
    expect(classifyOwner('')).toBe('blank');
    expect(classifyOwner('   ')).toBe('blank');
    expect(classifyOwner(null)).toBe('blank');
    expect(classifyOwner(undefined)).toBe('blank');
    expect(classifyOwner('x')).toBe('blank');
  });
});

describe('searchName', () => {
  it('flips a surname-first individual name', () => {
    expect(searchName('Baugher Jason E')).toBe('Jason Baugher');
    expect(searchName('Harrison Phillip L')).toBe('Phillip Harrison');
  });

  it('flips a two-token name', () => {
    expect(searchName('Martinez Petra')).toBe('Petra Martinez');
  });

  it('handles a comma-separated surname-first name', () => {
    expect(searchName('MARTINEZ, PETRA')).toBe('PETRA MARTINEZ');
  });

  it('leaves an entity name alone', () => {
    expect(searchName('Baabco Properties II LLC')).toBe('Baabco Properties II LLC');
  });

  it('leaves a single token alone', () => {
    expect(searchName('Cher')).toBe('Cher');
  });

  it('returns an empty string for junk rather than inventing a name', () => {
    expect(searchName('See Offer Instructions')).toBe('');
    expect(searchName('')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/src/lib/mlsOwner.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `functions/src/lib/mlsOwner.js`:

```js
/**
 * The connectMLS `Owner` column is agent-typed free text. Across 2,321 deduped
 * listings it is 55% person names, 32% entities, 7.5% instructions to the agent
 * ("See Offer Instructions", "yep"), and 5% an address typed where a name
 * belongs. Classifying it is what keeps the junk out of a call list.
 *
 * Rule order matters: junk is tested before addressLike, so "See 123 Main"
 * classifies as junk rather than as an address.
 */

const JUNK = /^(see\b|private owner|yep$|n\/?a$|unknown|owner$|agent$|call\b|tbd$|none$|[.\-*]+$)/i;
const ENTITY = /\b(LLC|L\.L\.C|LP|L\.P|INC|TRUST|PROPERTIES|CORP|HOLDINGS|LTD|INVESTMENTS|PARTNERS|COMPANY|CO)\b/i;
// A trailing single letter is a middle initial, not a surname.
const INITIAL = /^[A-Z]$/i;

const classifyOwner = (raw) => {
  const value = String(raw ?? '').trim();
  if (value.length < 2) return 'blank';
  if (JUNK.test(value)) return 'junk';
  if (/\d/.test(value)) return 'addressLike';
  return ENTITY.test(value) ? 'entity' : 'person';
};

/**
 * Individual owners arrive surname-first — "Baugher Jason E", or
 * "MARTINEZ, PETRA" in the eviction data. People-search sites want given name
 * first. Entities are returned untouched: "Properties Baabco II LLC" would
 * find nothing.
 */
const searchName = (raw) => {
  const kind = classifyOwner(raw);
  if (kind !== 'person') return kind === 'entity' ? String(raw).trim() : '';

  const value = String(raw).trim();
  if (value.includes(',')) {
    const [surname, rest] = value.split(',', 2);
    const given = rest.trim();
    return given ? `${given} ${surname.trim()}` : surname.trim();
  }

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return value;

  const [surname, ...rest] = parts;
  const given = rest.filter((part) => !INITIAL.test(part));
  return given.length ? `${given.join(' ')} ${surname}` : `${rest.join(' ')} ${surname}`;
};

module.exports = { classifyOwner, searchName };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run functions/src/lib/mlsOwner.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 158 across 17 files (146 + 12).

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/mlsOwner.js functions/src/lib/mlsOwner.test.js
git commit -m "Add MLS owner classification and search-name normalisation"
```

---

### Task 2: Workbook parser

**Files:**
- Create: `functions/src/lib/mlsWorkbook.js`, `functions/src/lib/mlsWorkbook.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `parseSheet(rows)` → normalised lead objects; `dedupe(leads)` → first-occurrence-wins array; `MLS_COLUMNS` → the 30 source column names

- [ ] **Step 1: Write the failing test**

Create `functions/src/lib/mlsWorkbook.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseSheet, dedupe, MLS_COLUMNS } from './mlsWorkbook.js';

const row = {
  'MLS#': 1853544, Status: 'SLD', Area: 1700, Address: '804  Station',
  'LP/SP': 530000, DOM: 149, 'Ttl Units': 4, SqFt: 4352, 'Yr Blt': 1985,
  Type: '2STRY', 'Bldr Name': 'Unknown', Constrctn: '', County: 'Bexar',
  'CountAct#': null, 'County Tax': '', 'Legal Desc': 'Cb 5063J Blk 1',
  'LglDsc-Lot': 'NE 78', 'List Agent': 'Ayhan Oruc', 'List Agent Ph.': '(210) 287-7246',
  Owner: 'Baabco Properties II LLC', 'LREA/LREB': 'No', 'Selling Agent': 'Tatyana Sutton',
  'Selling Agent Ph.': '(210) 980-6136', State: 'Texas', Dir: '', 'Street Name': 'Station',
  'Str #': 804, TaxPropID: null, Zip: 78109, ZipPlus: null,
};

describe('MLS_COLUMNS', () => {
  it('names all 30 source columns', () => {
    expect(MLS_COLUMNS).toHaveLength(30);
    expect(MLS_COLUMNS).toContain('MLS#');
    expect(MLS_COLUMNS).toContain('ZipPlus');
  });
});

describe('parseSheet', () => {
  it('maps every column onto the model', () => {
    const [lead] = parseSheet([row]);
    expect(lead.mlsNumber).toBe('1853544');
    expect(lead.status).toBe('SLD');
    expect(lead.county).toBe('Bexar');
    expect(lead.price).toBe(530000);
    expect(lead.totalUnits).toBe(4);
    expect(lead.zip).toBe('78109');
    expect(lead.mlsOwnerRaw).toBe('Baabco Properties II LLC');
    expect(lead.listAgent).toBe('Ayhan Oruc');
    expect(lead.legalLot).toBe('NE 78');
  });

  it('tolerates the nulls that appear in real exports', () => {
    const [lead] = parseSheet([row]);
    expect(lead.countyAccountNumber).toBe('');
    expect(lead.taxPropId).toBe('');
    expect(lead.zipPlus).toBe('');
  });

  it('collapses the double space in the address', () => {
    expect(parseSheet([row])[0].address).toBe('804 Station');
  });

  it('skips a row with no MLS number rather than importing a ghost', () => {
    expect(parseSheet([{ ...row, 'MLS#': null }])).toHaveLength(0);
  });
});

describe('dedupe', () => {
  it('keeps the first occurrence of a repeated MLS number', () => {
    const a = { mlsNumber: '1', status: 'ACT' };
    const b = { mlsNumber: '1', status: 'SLD' };
    const c = { mlsNumber: '2', status: 'EXP' };
    const result = dedupe([a, b, c]);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('ACT');
  });

  it('returns an empty array unchanged', () => {
    expect(dedupe([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/src/lib/mlsWorkbook.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

Create `functions/src/lib/mlsWorkbook.js`:

```js
/**
 * connectMLS multifamily exports. All four files observed share one 30-column
 * layout, so one parser serves them. Every column is carried onto the model —
 * a field that looks useless here is the one wanted while working a lead, and
 * recovering it later means a re-import.
 */

const MLS_COLUMNS = [
  'MLS#', 'Status', 'Area', 'Address', 'LP/SP', 'DOM', 'Ttl Units', 'SqFt',
  'Yr Blt', 'Type', 'Bldr Name', 'Constrctn', 'County', 'CountAct#',
  'County Tax', 'Legal Desc', 'LglDsc-Lot', 'List Agent', 'List Agent Ph.',
  'Owner', 'LREA/LREB', 'Selling Agent', 'Selling Agent Ph.', 'State', 'Dir',
  'Street Name', 'Str #', 'TaxPropID', 'Zip', 'ZipPlus',
];

const text = (value) => String(value ?? '').trim();
// Addresses arrive with a doubled space where the directional would go.
const squash = (value) => text(value).replace(/\s+/g, ' ');
const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRow = (row) => {
  const mlsNumber = text(row['MLS#']);
  if (!mlsNumber) return null;
  return {
    mlsNumber,
    status: text(row.Status),
    areaCode: text(row.Area),
    address: squash(row.Address),
    streetNumber: text(row['Str #']),
    streetDir: text(row.Dir),
    streetName: squash(row['Street Name']),
    zip: text(row.Zip),
    zipPlus: text(row.ZipPlus),
    county: text(row.County),
    state: text(row.State),
    price: number(row['LP/SP']),
    daysOnMarket: number(row.DOM),
    totalUnits: number(row['Ttl Units']),
    squareFeet: number(row.SqFt),
    yearBuilt: number(row['Yr Blt']),
    propertyType: text(row.Type),
    construction: text(row.Constrctn),
    builderName: text(row['Bldr Name']),
    legalDescription: text(row['Legal Desc']),
    legalLot: text(row['LglDsc-Lot']),
    countyAccountNumber: text(row['CountAct#']),
    taxPropId: text(row.TaxPropID),
    countyTax: text(row['County Tax']),
    listAgent: text(row['List Agent']),
    listAgentPhone: text(row['List Agent Ph.']),
    sellingAgent: text(row['Selling Agent']),
    sellingAgentPhone: text(row['Selling Agent Ph.']),
    lreaLreb: text(row['LREA/LREB']),
    mlsOwnerRaw: text(row.Owner),
  };
};

const parseSheet = (rows) => rows.map(parseRow).filter(Boolean);

// The four exports overlap: 2,471 rows carry 2,321 distinct MLS numbers.
// First occurrence wins, so the earliest file in the upload is authoritative.
const dedupe = (leads) => {
  const seen = new Set();
  return leads.filter((lead) => {
    if (seen.has(lead.mlsNumber)) return false;
    seen.add(lead.mlsNumber);
    return true;
  });
};

module.exports = { MLS_COLUMNS, parseSheet, dedupe };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run functions/src/lib/mlsWorkbook.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 165 across 18 files.

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/mlsWorkbook.js functions/src/lib/mlsWorkbook.test.js
git commit -m "Add the connectMLS workbook parser"
```

---

### Task 3: Schema and routes

**Files:**
- Modify: `functions/prisma/schema.prisma`
- Create: `functions/src/routes/mlsLeads.js`
- Modify: `functions/src/index.js`

**Interfaces:**
- Consumes: `classifyOwner`, `searchName` from Task 1; `parseSheet`, `dedupe` from Task 2
- Produces: `POST /api/mls-leads/import`, `GET /api/mls-leads`, `GET /api/mls-leads/:id`, `PATCH /api/mls-leads/:id`

- [ ] **Step 1: Add the models**

In `functions/prisma/schema.prisma`, after the eviction models:

```prisma
model MlsLead {
  id         String  @id @default(cuid())
  userId     String?
  mlsNumber  String
  status     String
  previousStatus  String?
  statusChangedAt DateTime?

  address      String
  streetNumber String @default("")
  streetDir    String @default("")
  streetName   String @default("")
  zip          String @default("")
  zipPlus      String @default("")
  county       String @default("")
  state        String @default("")
  areaCode     String @default("")

  price        Float?
  daysOnMarket Int?
  totalUnits   Int?
  squareFeet   Int?
  yearBuilt    Int?
  propertyType String @default("")
  construction String @default("")
  builderName  String @default("")

  legalDescription    String @default("") @db.Text
  legalLot            String @default("")
  countyAccountNumber String @default("")
  taxPropId           String @default("")
  countyTax           String @default("")

  listAgent         String @default("")
  listAgentPhone    String @default("")
  sellingAgent      String @default("")
  sellingAgentPhone String @default("")
  lreaLreb          String @default("")

  mlsOwnerRaw String @default("")

  cadLookupAt     DateTime?
  cadLookupStatus String?

  notes    String    @default("") @db.Text
  hidden   Boolean   @default(false)
  hiddenAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  contacts MlsContact[]
  user     User?        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, mlsNumber])
  @@index([userId])
  @@index([status])
  @@index([county])
  @@index([hidden])
  @@map("mls_leads")
}

model MlsContact {
  id        String @id @default(cuid())
  mlsLeadId String
  role      String
  name      String
  nameKind  String
  searchName String @default("")

  mailingAddress String   @default("")
  phoneNumbers   String[] @default([])
  emails         String[] @default([])

  workflowStage String @default("not_started")
  workflowLog   Json   @default("[]")
  notes         String @default("") @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lead MlsLead @relation(fields: [mlsLeadId], references: [id], onDelete: Cascade)

  @@unique([mlsLeadId, role])
  @@index([mlsLeadId])
  @@map("mls_contacts")
}
```

In `model User`, add to the relations block:

```prisma
  mlsLeads          MlsLead[]
```

- [ ] **Step 2: Verify the schema**

```bash
cd functions
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate
```

Expected: valid, and `Generated Prisma Client`. Do NOT run `db push` or `migrate`.

- [ ] **Step 3: Write the routes**

Create `functions/src/routes/mlsLeads.js`:

```js
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { classifyOwner, searchName } = require('../lib/mlsOwner');
const { parseSheet, dedupe } = require('../lib/mlsWorkbook');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticateToken);

// Import. Batched rather than one transaction per row: the eviction importer
// originally ran 294 transactions against a 5-second default timeout and never
// completed on a large workbook.
router.post('/import', upload.array('files'), async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = [];
    for (const file of req.files || []) {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      for (const name of wb.SheetNames) {
        rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }));
      }
    }

    const leads = dedupe(parseSheet(rows));
    if (!leads.length) return res.status(400).json({ error: 'No rows with an MLS number were found' });

    const existing = await prisma.mlsLead.findMany({
      where: { userId, mlsNumber: { in: leads.map((l) => l.mlsNumber) } },
      select: { id: true, mlsNumber: true, status: true },
    });
    const byNumber = new Map(existing.map((row) => [row.mlsNumber, row]));

    let created = 0;
    let updated = 0;
    let statusChanges = 0;

    for (const lead of leads) {
      const prior = byNumber.get(lead.mlsNumber);
      if (!prior) {
        const row = await prisma.mlsLead.create({ data: { ...lead, userId } });
        await createContact(row.id, lead.mlsOwnerRaw);
        created += 1;
        continue;
      }
      // A status change is the buy signal — record where it came from rather
      // than overwriting it.
      const changed = prior.status !== lead.status;
      await prisma.mlsLead.update({
        where: { id: prior.id },
        data: {
          ...lead,
          ...(changed && {
            previousStatus: prior.status,
            statusChangedAt: new Date(),
            hidden: false,
            hiddenAt: null,
          }),
        },
      });
      if (changed) statusChanges += 1;
      updated += 1;
    }

    res.json({ created, updated, statusChanges, total: leads.length });
  } catch (err) {
    console.error('[MLS] import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

async function createContact(mlsLeadId, rawOwner) {
  const nameKind = classifyOwner(rawOwner);
  if (nameKind !== 'person' && nameKind !== 'entity') return;
  await prisma.mlsContact.create({
    data: {
      mlsLeadId,
      role: 'mls_owner',
      name: String(rawOwner).trim(),
      nameKind,
      searchName: searchName(rawOwner),
    },
  });
}

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const where = { userId: req.user.id };

  if (req.query.showHidden !== 'true') where.hidden = false;
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.county) where.county = String(req.query.county);
  if (req.query.minUnits) where.totalUnits = { gte: Number(req.query.minUnits) };
  if (req.query.search) {
    const search = String(req.query.search);
    where.OR = [
      { address: { contains: search, mode: 'insensitive' } },
      { mlsOwnerRaw: { contains: search, mode: 'insensitive' } },
      { mlsNumber: { contains: search } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.mlsLead.count({ where }),
    prisma.mlsLead.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
      include: { contacts: true },
    }),
  ]);

  res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

router.get('/:id', async (req, res) => {
  const item = await prisma.mlsLead.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { contacts: { orderBy: { role: 'asc' } } },
  });
  if (!item) return res.status(404).json({ error: 'Lead not found' });
  res.json(item);
});

router.patch('/:id', async (req, res) => {
  const allowed = ['notes', 'hidden'];
  const data = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) data[key] = req.body[key];
  }
  if (Object.prototype.hasOwnProperty.call(data, 'hidden')) {
    data.hiddenAt = data.hidden ? new Date() : null;
  }
  const result = await prisma.mlsLead.updateMany({ where: { id: req.params.id, userId: req.user.id }, data });
  if (!result.count) return res.status(404).json({ error: 'Lead not found' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Mount the router**

In `functions/src/index.js`, alongside the other route mounts:

```js
const mlsLeadRoutes = require('./routes/mlsLeads');
app.use('/api/mls-leads', mlsLeadRoutes);
```

Place the `require` with the other requires and the `app.use` with the other mounts, matching the file's existing arrangement.

- [ ] **Step 5: Verify**

```bash
node --check functions/src/routes/mlsLeads.js
node --check functions/src/index.js
npm test
```

Expected: both checks exit 0; suite unchanged at 165 across 18 files. This task adds no tests — its logic is in Tasks 1 and 2, and the rest needs a live database.

- [ ] **Step 6: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/routes/mlsLeads.js functions/src/index.js
git commit -m "Add MLS lead models and routes"
```

---

### Task 4: The working list and details view

**Files:**
- Create: `src/components/mls/MlsLeadsView.tsx`, `src/components/mls/MlsLeadDetails.tsx`
- Modify: `src/components/layout/navItems.ts`, `src/pages/Index.tsx`

**Interfaces:**
- Consumes: the four routes from Task 3
- Produces: the `Custom MLS Leads` tab

- [ ] **Step 1: Add the tab**

In `src/components/layout/navItems.ts`, add `'mls'` to the `TabType` union and this entry to `tabs`, after `evictions`:

```ts
  { id: 'mls' as TabType, label: 'Custom MLS Leads', icon: Building2, shortLabel: 'MLS' },
```

Import `Building2` from `lucide-react` alongside the existing icons.

- [ ] **Step 2: Route the tab**

In `src/pages/Index.tsx`, add `'mls'` to the `validTabs` array and a case to `renderContent`:

```tsx
      case 'mls':
        return <MlsLeadsView />;
```

with the matching import.

- [ ] **Step 3: Build the list view**

Create `src/components/mls/MlsLeadsView.tsx`. It follows `src/crm/views/EvictionLeadsView.tsx` for its structure — a header with an upload control, a filter bar, a `.data-table`, and pagination — and must:

- upload one or more `.XLS` files to `POST /api/mls-leads/import` as `files`, showing the returned `created` / `updated` / `statusChanges` counts
- filter by search, status, county, and minimum units, with a `Show hidden` toggle
- render columns: `ADDRESS`, `STATUS`, `UNITS`, `PRICE` (labelled by status — sale price on `SLD`, list price otherwise), `COUNTY`, `OWNER` with its kind, and a hide button
- use `.record` for numeric and date values only, never for names or labels
- show a row's `previousStatus` when set, so an `ACT` → `SLD` change is visible in the list
- open the details view on row click

- [ ] **Step 4: Build the details view**

Create `src/components/mls/MlsLeadDetails.tsx`, a dialog showing **every one of the 30 columns**, grouped:

- **Property** — address parts, zip, zipPlus, county, state, area, status with `previousStatus` and `statusChangedAt`, units, square feet, year built, type, construction, builder, price labelled by status, days on market
- **County** — legal description, legal lot, county account number, tax property id, county tax
- **Agents** — list agent and phone, selling agent and phone, LREA/LREB
- **Owner** — each `MlsContact` with its name, kind, and `searchName`; plus `mlsOwnerRaw` shown verbatim so a misclassification is visible
- **Notes** — editable, PATCHed to the lead

Blank fields render an explicit `—` rather than being omitted, so missing data is distinguishable from a field the screen forgot.

- [ ] **Step 5: Verify**

```bash
npm test
npm run build
```

Expected: 165 across 18 files, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/mls src/components/layout/navItems.ts src/pages/Index.tsx
git commit -m "Add the Custom MLS Leads tab"
```

---

## Self-Review

**Spec coverage for Phase 1:**

| Requirement | Task |
| --- | --- |
| All 30 columns stored | 2 (parser) + 3 (model) |
| All 30 columns shown | 4 (details) |
| Dedupe on `MLS#` | 2 |
| `@@unique([userId, mlsNumber])` | 3 |
| Status transitions recorded | 3 (import) + 4 (rendered) |
| Owner classification, junk before addressLike | 1 |
| `mlsOwnerRaw` always retained | 2 + 3 |
| Contacts only for person/entity | 3 (`createContact`) |
| Surname-first normalisation | 1 |
| `price` labelled by status | 4 |
| Hide with `Show hidden`, un-hidden by a status change | 3 + 4 |

**Deferred and explicitly not stubbed:** CAD lookup, Comptroller entity lookup, workflow transitions, follow-ups.

**Placeholder scan:** Task 4's steps 3 and 4 describe the views as requirements rather than quoting complete JSX. That is deliberate — they are long, and both follow `EvictionLeadsView.tsx`, which the implementer must read anyway for the conventions. Every field, column, and behaviour is named. Nothing else in the plan defers a decision.

**Type consistency:** `parseSheet` emits exactly the field names `MlsLead` declares, so the import spreads it directly. `classifyOwner`'s five return values are the only values written to `MlsContact.nameKind`.

**A risk worth naming:** the import creates and updates rows one at a time inside a loop. At 2,321 rows that is 2,321 round trips — slow, but not the 5-second-transaction failure the eviction importer hit, because each statement is independent. If it proves too slow, the fix is `createMany` for the insert half, which is what fixed the eviction import.
