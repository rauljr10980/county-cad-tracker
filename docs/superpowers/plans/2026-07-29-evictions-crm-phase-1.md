# Evictions CRM Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Evictions CRM workspace inside the Real Estate Acquisitions platform — reached from the Header menu behind a password prompt — with a dashboard, a 12-stage pipeline, and a landlord profile, all sharing the existing `eviction_landlords` records with the Eviction List tab.

**Architecture:** One record per landlord. The CRM adds columns to `eviction_landlords` instead of copying rows, so "automatic sync" and "no duplicate contacts" are structural rather than maintained. The frontend is a full-screen hash route (`#evictions-crm`) rendered outside `TabNavigation`, styled with the app's existing dark theme tokens. The backend adds three endpoints and one migration to the existing Express/Prisma service.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui, `@dnd-kit` for the pipeline board, Express + Prisma + PostgreSQL on Railway, Vitest for tests (added by Task 1).

## Global Constraints

- Stage vocabulary is exactly these 12 values, in this order: `New Lead`, `Researching`, `Ready to Contact`, `Attempted Contact`, `Contacted`, `Follow-Up`, `Appointment Scheduled`, `Interested`, `Not Interested`, `Under Contract`, `Closed`, `Do Not Contact`.
- `src/crm-evictions/constants.ts` is the single source of truth for stages. The Eviction List tab imports from it. Never redeclare the list.
- The CRM uses the app's existing dark theme Tailwind tokens (`bg-card`, `text-muted-foreground`, `border`, `text-primary`). Do not use the `.urg` corporate classes from `src/styles/corporate.css` — those belong to the Eviction List tab only.
- `GET /api/evictions/landlords` must keep its current default behavior (`isCorporate: false`) when the `corporate` param is absent, so the existing Eviction List tab is unaffected.
- Backend is CommonJS (`require`), frontend is ESM (`import`). Do not mix.
- Frontend path alias is `@/` → `src/`.
- All `/api/evictions` routes are already behind `authenticateToken` via `router.use()`. Do not add per-route auth.
- Commit after every task.

---

### Task 1: Stage vocabulary and test infrastructure

**Files:**
- Create: `src/crm-evictions/constants.ts`
- Create: `src/crm-evictions/constants.test.ts`
- Modify: `vite.config.ts`
- Modify: `package.json` (scripts + devDependencies)
- Modify: `src/crm/views/EvictionLeadsView.tsx:22` (replace local `stages` array)

**Interfaces:**
- Consumes: nothing
- Produces: `STAGES: readonly Stage[]`, `type Stage`, `mapLegacyStage(value: string): string`, `STAGE_TONE: Record<Stage, string>`

- [ ] **Step 1: Install Vitest and testing libraries**

```bash
npm install -D vitest@^2.1.8 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3
```

- [ ] **Step 2: Add the test script to `package.json`**

In the `"scripts"` block, add after `"lint": "eslint ."`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: Add Vitest config to `vite.config.ts`**

Add `test` to the config object returned by `defineConfig`, as a sibling of `build`:

```ts
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
```

Add this as the first line of the file:

```ts
/// <reference types="vitest" />
```

- [ ] **Step 4: Write the failing test**

Create `src/crm-evictions/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STAGES, mapLegacyStage } from './constants';

describe('STAGES', () => {
  it('has the 12 stages in pipeline order', () => {
    expect(STAGES).toEqual([
      'New Lead', 'Researching', 'Ready to Contact', 'Attempted Contact',
      'Contacted', 'Follow-Up', 'Appointment Scheduled', 'Interested',
      'Not Interested', 'Under Contract', 'Closed', 'Do Not Contact',
    ]);
  });
});

describe('mapLegacyStage', () => {
  it('maps every legacy value to a current stage', () => {
    expect(mapLegacyStage('New')).toBe('New Lead');
    expect(mapLegacyStage('Researching')).toBe('Researching');
    expect(mapLegacyStage('Contacted')).toBe('Contacted');
    expect(mapLegacyStage('Follow Up')).toBe('Follow-Up');
    expect(mapLegacyStage('Qualified')).toBe('Interested');
    expect(mapLegacyStage('Not Interested')).toBe('Not Interested');
    expect(mapLegacyStage('Do Not Call')).toBe('Do Not Contact');
  });

  it('produces only values that exist in STAGES', () => {
    const legacy = ['New', 'Researching', 'Contacted', 'Follow Up', 'Qualified', 'Not Interested', 'Do Not Call'];
    for (const value of legacy) {
      expect(STAGES).toContain(mapLegacyStage(value));
    }
  });

  it('passes unknown values through untouched rather than coercing them', () => {
    expect(mapLegacyStage('Something Else')).toBe('Something Else');
    expect(mapLegacyStage('')).toBe('');
  });

  it('leaves already-migrated values alone', () => {
    for (const stage of STAGES) {
      expect(mapLegacyStage(stage)).toBe(stage);
    }
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- src/crm-evictions/constants.test.ts`
Expected: FAIL — cannot resolve `./constants`.

- [ ] **Step 6: Write the implementation**

Create `src/crm-evictions/constants.ts`:

```ts
/**
 * Single source of truth for the eviction pipeline vocabulary.
 *
 * Both the Evictions CRM and the Eviction List tab import from here. They write
 * the same `contactStage` column on the same row, so the lists cannot be allowed
 * to drift.
 */

export const STAGES = [
  'New Lead',
  'Researching',
  'Ready to Contact',
  'Attempted Contact',
  'Contacted',
  'Follow-Up',
  'Appointment Scheduled',
  'Interested',
  'Not Interested',
  'Under Contract',
  'Closed',
  'Do Not Contact',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Pre-migration values, kept so the frontend renders correctly if it meets a row
 * the migration has not reached yet. Unknown values pass through untouched so bad
 * data is visible rather than silently folded into a real stage.
 */
const LEGACY_STAGES: Record<string, Stage> = {
  New: 'New Lead',
  'Follow Up': 'Follow-Up',
  Qualified: 'Interested',
  'Do Not Call': 'Do Not Contact',
};

export const mapLegacyStage = (value: string): string => LEGACY_STAGES[value] ?? value;

/** Tailwind classes per stage, used by pipeline cards and stage badges. */
export const STAGE_TONE: Record<Stage, string> = {
  'New Lead': 'bg-muted text-muted-foreground',
  Researching: 'bg-warning/15 text-warning',
  'Ready to Contact': 'bg-primary/15 text-primary',
  'Attempted Contact': 'bg-primary/15 text-primary',
  Contacted: 'bg-primary/20 text-primary',
  'Follow-Up': 'bg-warning/15 text-warning',
  'Appointment Scheduled': 'bg-accent/20 text-accent',
  Interested: 'bg-success/15 text-success',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Under Contract': 'bg-success/20 text-success',
  Closed: 'bg-success/25 text-success',
  'Do Not Contact': 'bg-destructive/15 text-destructive',
};

export const SERVICE_INTERESTS = [
  'Undecided',
  'Acquisition / Sell to Us',
  'Listing',
  'Property Management',
] as const;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- src/crm-evictions/constants.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Point the Eviction List tab at the shared list**

In `src/crm/views/EvictionLeadsView.tsx`, delete these two lines (currently line 22-23):

```ts
const stages = ['New', 'Researching', 'Contacted', 'Follow Up', 'Qualified', 'Not Interested', 'Do Not Call'];
const services = ['Undecided', 'Acquisition / Sell to Us', 'Listing', 'Property Management'];
```

Replace with an import next to the other imports at the top of the file:

```ts
import { STAGES, SERVICE_INTERESTS } from '@/crm-evictions/constants';
```

Then replace every use of `stages` with `STAGES` and every use of `services` with `SERVICE_INTERESTS`. There are 5 occurrences: two `.map()` calls in the filter selects, one in the dialog's stage select, one in the service chip row, and one in `toggleService`'s default.

- [ ] **Step 9: Verify the app still builds**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/crm-evictions/constants.ts src/crm-evictions/constants.test.ts src/crm/views/EvictionLeadsView.tsx
git commit -m "Add shared eviction stage vocabulary and Vitest"
```

---

### Task 2: Database migration — stage remap and lead assignment

**Files:**
- Create: `functions/prisma/migrations/20260729000000_add_eviction_crm_fields/migration.sql`
- Modify: `functions/prisma/schema.prisma:18-45` (User model) and `:895-919` (EvictionLandlord model)

**Interfaces:**
- Consumes: `mapLegacyStage` mapping from Task 1 (as the source of truth for the SQL below)
- Produces: `eviction_landlords.assignedToId` column, `EvictionLandlord.assignedTo` Prisma relation, remapped `contactStage` values

- [ ] **Step 1: Write the migration SQL**

Create `functions/prisma/migrations/20260729000000_add_eviction_crm_fields/migration.sql`:

```sql
-- Lead assignment. SET NULL so removing a user unassigns their leads
-- rather than cascading the landlord rows away.
ALTER TABLE "eviction_landlords" ADD COLUMN "assignedToId" TEXT;

ALTER TABLE "eviction_landlords"
  ADD CONSTRAINT "eviction_landlords_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "eviction_landlords_assignedToId_idx"
  ON "eviction_landlords"("assignedToId");

-- Widen the stage vocabulary from 7 values to 12.
ALTER TABLE "eviction_landlords" ALTER COLUMN "contactStage" SET DEFAULT 'New Lead';

UPDATE "eviction_landlords" SET "contactStage" = 'New Lead'       WHERE "contactStage" = 'New';
UPDATE "eviction_landlords" SET "contactStage" = 'Follow-Up'      WHERE "contactStage" = 'Follow Up';
UPDATE "eviction_landlords" SET "contactStage" = 'Interested'     WHERE "contactStage" = 'Qualified';
UPDATE "eviction_landlords" SET "contactStage" = 'Do Not Contact' WHERE "contactStage" = 'Do Not Call';

-- Surface anything the mapping did not cover instead of coercing it.
DO $$
DECLARE
  stray RECORD;
BEGIN
  FOR stray IN
    SELECT "contactStage", COUNT(*) AS n
    FROM "eviction_landlords"
    WHERE "contactStage" NOT IN (
      'New Lead','Researching','Ready to Contact','Attempted Contact',
      'Contacted','Follow-Up','Appointment Scheduled','Interested',
      'Not Interested','Under Contract','Closed','Do Not Contact'
    )
    GROUP BY "contactStage"
  LOOP
    RAISE WARNING 'Unmapped contactStage % on % row(s) — left untouched', stray."contactStage", stray.n;
  END LOOP;
END $$;
```

- [ ] **Step 2: Update the Prisma schema**

In `functions/prisma/schema.prisma`, change line 900 of the `EvictionLandlord` model from:

```prisma
  contactStage     String    @default("New")
```

to:

```prisma
  contactStage     String    @default("New Lead")
```

Add this field to `EvictionLandlord` after `nextFollowUpAt`:

```prisma
  assignedToId     String?
```

Add to the relations block of `EvictionLandlord`, after `tasks`:

```prisma
  assignedTo User? @relation("EvictionAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)
```

Add to the index block of `EvictionLandlord`:

```prisma
  @@index([assignedToId])
```

In the `User` model, add to the relations block after `activityLogs`:

```prisma
  evictionLandlords EvictionLandlord[] @relation("EvictionAssignee")
```

- [ ] **Step 3: Validate the schema parses**

Run: `cd functions && npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid."

- [ ] **Step 4: Generate the client**

Run: `cd functions && npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 5: Commit**

```bash
git add functions/prisma/schema.prisma functions/prisma/migrations/20260729000000_add_eviction_crm_fields/migration.sql
git commit -m "Add eviction lead assignment and remap stage vocabulary"
```

> **Note for the implementer:** do not run `prisma migrate deploy` locally against production. Railway runs it on deploy via the `railway:start` script.

---

### Task 3: Backend — password verification endpoint

**Files:**
- Modify: `functions/src/routes/auth.js` (add route after the `/login` handler, before `/session`)

**Interfaces:**
- Consumes: `authenticateToken` from `../middleware/auth`, `bcrypt` from `bcryptjs`, `prisma` from `../lib/prisma` — all already imported at the top of the file
- Produces: `POST /api/auth/verify-password` accepting `{ password: string }`, returning `{ ok: true }` or 401 `{ error }`

- [ ] **Step 1: Add the rate limiter and route**

In `functions/src/routes/auth.js`, add to the imports at the top:

```js
const rateLimit = require('express-rate-limit');
```

Then insert this after the `/login` route's closing `);` and before the `SESSION CHECK` comment block:

```js
// ============================================================================
// VERIFY PASSWORD (soft gate for the Evictions CRM workspace)
// ============================================================================

// This is a UI affordance, not access control — the caller's JWT already
// authorizes the underlying endpoints. Rate limited so it cannot be used as a
// password oracle.
const verifyPasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  message: { error: 'Too many attempts. Wait a minute and try again.' }
});

router.post('/verify-password',
  authenticateToken,
  verifyPasswordLimiter,
  [body('password').notEmpty().withMessage('Password required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      // authenticateToken selects only id/username/email/role, so the hash has
      // to be fetched here.
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const valid = await bcrypt.compare(req.body.password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('[AUTH] Verify password error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  }
);
```

- [ ] **Step 2: Verify the file parses**

Run: `cd functions && node --check src/routes/auth.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add functions/src/routes/auth.js
git commit -m "Add password verification endpoint for CRM gate"
```

---

### Task 4: Backend — stats endpoint

**Files:**
- Modify: `functions/src/routes/evictions.js` (add route after the `/imports` route at line 220)

**Interfaces:**
- Consumes: `prisma` and `router`, already in scope in that file
- Produces: `GET /api/evictions/stats` returning `{ total, byStage, byService, byAssignee, unassigned, followUpsDue: { overdue, today, next7 }, activeOpportunities, closedDeals }`

- [ ] **Step 1: Add the route**

In `functions/src/routes/evictions.js`, insert after the `/imports` route:

```js
const ACTIVE_OPPORTUNITY_STAGES = ['Interested', 'Under Contract'];
const SERVICE_INTEREST_VALUES = ['Undecided', 'Acquisition / Sell to Us', 'Listing', 'Property Management'];

router.get('/stats', async (_req, res) => {
  try {
    const now = new Date();
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
    const endOfNext7 = new Date(now); endOfNext7.setDate(endOfNext7.getDate() + 7); endOfNext7.setHours(23, 59, 59, 999);

    const [total, stageGroups, assigneeGroups, unassigned, overdue, dueToday, dueNext7, serviceCounts] = await Promise.all([
      prisma.evictionLandlord.count(),
      prisma.evictionLandlord.groupBy({ by: ['contactStage'], _count: { _all: true } }),
      prisma.evictionLandlord.groupBy({ by: ['assignedToId'], _count: { _all: true }, where: { assignedToId: { not: null } } }),
      prisma.evictionLandlord.count({ where: { assignedToId: null } }),
      prisma.evictionTask.count({ where: { completed: false, dueAt: { lt: now } } }),
      prisma.evictionTask.count({ where: { completed: false, dueAt: { gte: now, lte: endOfToday } } }),
      prisma.evictionTask.count({ where: { completed: false, dueAt: { gte: now, lte: endOfNext7 } } }),
      Promise.all(SERVICE_INTEREST_VALUES.map(async (value) => [
        value,
        await prisma.evictionLandlord.count({ where: { serviceInterests: { has: value } } })
      ]))
    ]);

    const byStage = Object.fromEntries(stageGroups.map((g) => [g.contactStage, g._count._all]));

    const assigneeIds = assigneeGroups.map((g) => g.assignedToId);
    const users = assigneeIds.length
      ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, username: true } })
      : [];
    const usernameById = Object.fromEntries(users.map((u) => [u.id, u.username]));

    res.json({
      total,
      byStage,
      byService: Object.fromEntries(serviceCounts),
      byAssignee: assigneeGroups.map((g) => ({
        userId: g.assignedToId,
        username: usernameById[g.assignedToId] || 'Unknown',
        count: g._count._all
      })),
      unassigned,
      followUpsDue: { overdue, today: dueToday, next7: dueNext7 },
      activeOpportunities: ACTIVE_OPPORTUNITY_STAGES.reduce((sum, s) => sum + (byStage[s] || 0), 0),
      closedDeals: byStage['Closed'] || 0
    });
  } catch (error) {
    console.error('[EVICTIONS] Stats error:', error);
    res.status(500).json({ error: 'Unable to load stats' });
  }
});
```

- [ ] **Step 2: Verify the file parses**

Run: `cd functions && node --check src/routes/evictions.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add functions/src/routes/evictions.js
git commit -m "Add eviction CRM stats endpoint"
```

> **Note:** `/stats` must be declared before `/landlords/:id` is reachable for it — it is, since Express matches in declaration order and `/stats` does not collide with `/landlords/*`. No ordering hazard here.

---

### Task 5: Backend — corporate and assignment filters

**Files:**
- Modify: `functions/src/routes/evictions.js:222-241` (the `/landlords` route) and `:248-252` (the PATCH route)

**Interfaces:**
- Consumes: the `/landlords` route from the existing codebase
- Produces: `corporate` query param accepting `false` | `true` | `all` (default `false`), `assignedTo` query param accepting a user id or `unassigned`, `assignedTo` object on each returned item, `assignedToId` accepted by PATCH

- [ ] **Step 1: Replace the hardcoded corporate filter**

In `functions/src/routes/evictions.js`, change line 224 from:

```js
  const where = { isCorporate: false };
```

to:

```js
  // Default preserves the Eviction List tab's behavior; the CRM opts in with `all`.
  const where = {};
  if (req.query.corporate === 'all') { /* no filter */ }
  else if (req.query.corporate === 'true') where.isCorporate = true;
  else where.isCorporate = false;

  if (req.query.assignedTo === 'unassigned') where.assignedToId = null;
  else if (req.query.assignedTo) where.assignedToId = String(req.query.assignedTo);
```

- [ ] **Step 2: Include the assignee in the response**

In the same route, change the `include` block on the `findMany` call (line 238) to add `assignedTo`:

```js
      include: {
        _count: { select: { filings: true, addresses: true } },
        filings: { orderBy: { filedDate: 'desc' }, take: 1, select: { filedDate: true } },
        tasks: { where: { completed: false }, orderBy: { dueAt: 'asc' }, take: 1 },
        assignedTo: { select: { id: true, username: true } }
      }
```

`assignedTo` is returned as-is by the existing `items.map()`, which only strips `_count`, `filings`, and `tasks`. No change needed there.

- [ ] **Step 3: Allow assignment through PATCH**

Change line 249 from:

```js
  const allowed = ['contactStage', 'serviceInterests', 'contacts', 'notes', 'lastContactedAt', 'nextFollowUpAt'];
```

to:

```js
  const allowed = ['contactStage', 'serviceInterests', 'contacts', 'notes', 'lastContactedAt', 'nextFollowUpAt', 'assignedToId'];
```

- [ ] **Step 4: Include the assignee on the detail route**

In the `/landlords/:id` route (line 244), add to the `include` object:

```js
      assignedTo: { select: { id: true, username: true } },
```

- [ ] **Step 5: Verify the file parses**

Run: `cd functions && node --check src/routes/evictions.js`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add functions/src/routes/evictions.js
git commit -m "Add corporate and assignment filters to eviction landlords"
```

---

### Task 6: Frontend — types and API client

**Files:**
- Create: `src/crm-evictions/types/crm.ts`
- Create: `src/crm-evictions/api/evictionsCrm.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` and `getAuthHeaders` from `@/lib/api`; `Stage` from `../constants`
- Produces: types `Lead`, `LeadDetail`, `CrmStats`, `Assignee`; functions `verifyPassword(password)`, `getStats()`, `listLeads(params)`, `getLead(id)`, `patchLead(id, data)`

- [ ] **Step 1: Write the types**

Create `src/crm-evictions/types/crm.ts`:

```ts
import type { Stage } from '../constants';

export type Assignee = { id: string; username: string };

export type Phone = { number: string; status?: string; type?: string; source?: string };
export type Contacts = {
  phoneRows?: { name: string; phones: Phone[] }[];
  emailRows?: { name: string; emails: string[] }[];
};

export type Lead = {
  id: string;
  name: string;
  isCorporate: boolean;
  contactStage: Stage | string;
  serviceInterests: string[];
  contacts: Contacts;
  notes: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  assignedToId?: string | null;
  assignedTo?: Assignee | null;
  filingCount: number;
  addressCount: number;
  latestFilingDate?: string;
  nextTask?: { dueAt: string } | null;
};

export type LeadDetail = Lead & {
  addresses: { id: string; address: string; city: string; state: string; zip: string }[];
  filings: {
    id: string; caseNumber: string; filedDate?: string; caseStatus: string;
    precinct: string; disposition: string; dispositionDate?: string; plaintiffAddress: string;
  }[];
  activities: { id: string; kind: string; body: string; createdAt: string }[];
  tasks: { id: string; type: string; dueAt: string; completed: boolean; notes: string }[];
};

export type CrmStats = {
  total: number;
  byStage: Record<string, number>;
  byService: Record<string, number>;
  byAssignee: { userId: string; username: string; count: number }[];
  unassigned: number;
  followUpsDue: { overdue: number; today: number; next7: number };
  activeOpportunities: number;
  closedDeals: number;
};

export type LeadListResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export type ListLeadsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  stage?: string;
  service?: string;
  corporate?: 'true' | 'false' | 'all';
  assignedTo?: string;
};
```

- [ ] **Step 2: Write the API client**

Create `src/crm-evictions/api/evictionsCrm.ts`:

```ts
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import type { CrmStats, LeadDetail, LeadListResponse, ListLeadsParams } from '../types/crm';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = { ...getAuthHeaders(), ...(init?.headers || {}) } as Record<string, string>;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();

  let body: Record<string, unknown> = {};
  try {
    if (text) body = JSON.parse(text);
  } catch {
    body = { error: text || `Request failed (${res.status})` };
  }

  if (!res.ok) throw new Error((body.error as string) || `Request failed (${res.status})`);
  return body as T;
};

export const verifyPassword = (password: string) =>
  request<{ ok: true }>('/api/auth/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

export const getStats = () => request<CrmStats>('/api/evictions/stats');

export const listLeads = (params: ListLeadsParams = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return request<LeadListResponse>(`/api/evictions/landlords?${query}`);
};

export const getLead = (id: string) => request<LeadDetail>(`/api/evictions/landlords/${id}`);

export const patchLead = (id: string, data: Record<string, unknown>) =>
  request<LeadDetail>(`/api/evictions/landlords/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep crm-evictions`
Expected: no output (the repo has pre-existing errors elsewhere; only `crm-evictions` matters here).

- [ ] **Step 4: Commit**

```bash
git add src/crm-evictions/types/crm.ts src/crm-evictions/api/evictionsCrm.ts
git commit -m "Add Evictions CRM types and API client"
```

---

### Task 7: Frontend — password gate

**Files:**
- Create: `src/crm-evictions/auth/useCrmGrant.ts`
- Create: `src/crm-evictions/auth/useCrmGrant.test.ts`
- Create: `src/crm-evictions/auth/PasswordGateDialog.tsx`

**Interfaces:**
- Consumes: `verifyPassword` from `../api/evictionsCrm`
- Produces: `useCrmGrant(): { hasGrant: boolean; grant: () => void; revoke: () => void }`; `PasswordGateDialog({ open, onOpenChange, onGranted })`

- [ ] **Step 1: Write the failing test**

Create `src/crm-evictions/auth/useCrmGrant.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readGrant, writeGrant, clearGrant, GRANT_TTL_MS } from './useCrmGrant';

describe('CRM grant storage', () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is absent before anything is written', () => {
    expect(readGrant()).toBe(false);
  });

  it('is present immediately after being written', () => {
    writeGrant();
    expect(readGrant()).toBe(true);
  });

  it('expires once the TTL has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'));
    writeGrant();
    vi.setSystemTime(new Date(Date.now() + GRANT_TTL_MS + 1000));
    expect(readGrant()).toBe(false);
  });

  it('is cleared by revoke', () => {
    writeGrant();
    clearGrant();
    expect(readGrant()).toBe(false);
  });

  it('treats a corrupt stored value as no grant', () => {
    sessionStorage.setItem('evictionsCrmGrant', 'not-a-number');
    expect(readGrant()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/crm-evictions/auth/useCrmGrant.test.ts`
Expected: FAIL — cannot resolve `./useCrmGrant`.

- [ ] **Step 3: Write the hook**

Create `src/crm-evictions/auth/useCrmGrant.ts`:

```ts
import { useCallback, useState } from 'react';

/**
 * Tracks whether the user has satisfied the Evictions CRM password prompt.
 *
 * This is a UI gate, not access control. The app's JWT already authorizes every
 * /api/evictions call, so the data is reachable with that token regardless. The
 * grant lives in sessionStorage and dies with the tab.
 */

const KEY = 'evictionsCrmGrant';
export const GRANT_TTL_MS = 8 * 60 * 60 * 1000;

export const readGrant = (): boolean => {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return false;
  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() < expiresAt;
};

export const writeGrant = () => sessionStorage.setItem(KEY, String(Date.now() + GRANT_TTL_MS));

export const clearGrant = () => sessionStorage.removeItem(KEY);

export const useCrmGrant = () => {
  const [hasGrant, setHasGrant] = useState(readGrant);

  const grant = useCallback(() => { writeGrant(); setHasGrant(true); }, []);
  const revoke = useCallback(() => { clearGrant(); setHasGrant(false); }, []);

  return { hasGrant, grant, revoke };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/crm-evictions/auth/useCrmGrant.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the dialog**

Create `src/crm-evictions/auth/PasswordGateDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck } from 'lucide-react';
import { verifyPassword } from '../api/evictionsCrm';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onGranted: () => void };

export function PasswordGateDialog({ open, onOpenChange, onGranted }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setChecking(true); setError('');
    try {
      await verifyPassword(password);
      setPassword('');
      onGranted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setPassword(''); setError(''); } onOpenChange(next); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Evictions CRM
          </DialogTitle>
          <DialogDescription>
            Re-enter your password to open the CRM workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="password"
            autoFocus
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={!password || checking}>
            {checking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enter workspace
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/crm-evictions/auth
git commit -m "Add Evictions CRM password gate"
```

---

### Task 8: Frontend — workspace shell, menu entry, and routing

**Files:**
- Create: `src/crm-evictions/shell/EvictionsCrmWorkspace.tsx`
- Create: `src/crm-evictions/shell/CrmSidebar.tsx`
- Modify: `src/components/layout/Header.tsx` (menu item + prop)
- Modify: `src/pages/Index.tsx` (hash route + gate wiring)

**Interfaces:**
- Consumes: `useCrmGrant`, `PasswordGateDialog` from Task 7
- Produces: `EvictionsCrmWorkspace({ onExit })`; `CrmSection = 'dashboard' | 'pipeline' | 'leads'`; Header prop `onOpenEvictionsCrm?: () => void`

- [ ] **Step 1: Write the sidebar**

Create `src/crm-evictions/shell/CrmSidebar.tsx`:

```tsx
import { ArrowLeft, Gavel, KanbanSquare, LayoutDashboard, Users } from 'lucide-react';

export type CrmSection = 'dashboard' | 'pipeline' | 'leads';

const ITEMS: { id: CrmSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'leads', label: 'Leads', icon: Users },
];

type Props = { section: CrmSection; onSectionChange: (s: CrmSection) => void; onExit: () => void };

export function CrmSidebar({ section, onSectionChange, onExit }: Props) {
  return (
    <aside className="w-56 shrink-0 border-r bg-card/40 flex flex-col p-3 gap-1">
      <div className="flex items-center gap-2 px-2 py-3 mb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/15 grid place-items-center">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Evictions CRM</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Workspace</p>
        </div>
      </div>

      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSectionChange(id)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
            section === id ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}

      <button
        onClick={onExit}
        className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to platform
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: Write the workspace shell**

Create `src/crm-evictions/shell/EvictionsCrmWorkspace.tsx`. The three section components arrive in Tasks 9-11; for now render placeholders that those tasks replace.

```tsx
import { useState } from 'react';
import { CrmSidebar, type CrmSection } from './CrmSidebar';
import { DashboardPage } from '../dashboard/DashboardPage';
import { PipelinePage } from '../pipeline/PipelinePage';
import { LeadsPage } from '../leads/LeadsPage';

export function EvictionsCrmWorkspace({ onExit }: { onExit: () => void }) {
  const [section, setSection] = useState<CrmSection>('dashboard');

  return (
    <div className="fixed inset-0 z-40 flex bg-background">
      <CrmSidebar section={section} onSectionChange={setSection} onExit={onExit} />
      <main className="flex-1 overflow-y-auto">
        {section === 'dashboard' && <DashboardPage onOpenPipeline={() => setSection('pipeline')} />}
        {section === 'pipeline' && <PipelinePage />}
        {section === 'leads' && <LeadsPage />}
      </main>
    </div>
  );
}
```

> This file will not compile until Tasks 9, 10, and 11 create those three pages. Implement Tasks 9-11 before running the build.

- [ ] **Step 3: Add the menu item to the Header**

In `src/components/layout/Header.tsx`, add `Gavel` to the `lucide-react` import on line 1.

Add to the component's props type (find the `interface HeaderProps` or inline type near the top of the file) :

```ts
  onOpenEvictionsCrm?: () => void;
```

Destructure it alongside `onTabChange` in the component signature.

Then insert this inside `DropdownMenuContent`, immediately after the `Files` item's closing tag and before the `<DropdownMenuSeparator />` that precedes Logout:

```tsx
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onOpenEvictionsCrm}>
                          <Gavel className="h-4 w-4 mr-2" />
                          Login to Evictions CRM
                        </DropdownMenuItem>
```

- [ ] **Step 4: Wire the route and gate in `Index.tsx`**

Add these imports to `src/pages/Index.tsx`:

```ts
import { EvictionsCrmWorkspace } from '@/crm-evictions/shell/EvictionsCrmWorkspace';
import { PasswordGateDialog } from '@/crm-evictions/auth/PasswordGateDialog';
import { useCrmGrant } from '@/crm-evictions/auth/useCrmGrant';
```

Add state inside the `Index` component, after `phoneSearchResult`:

```ts
  const [isCrmOpen, setIsCrmOpen] = useState(() => window.location.hash.slice(1) === 'evictions-crm');
  const [isGateOpen, setIsGateOpen] = useState(false);
  const { hasGrant, grant } = useCrmGrant();

  const openEvictionsCrm = () => {
    if (hasGrant) { setIsCrmOpen(true); window.location.hash = 'evictions-crm'; }
    else setIsGateOpen(true);
  };

  const exitEvictionsCrm = () => { setIsCrmOpen(false); window.location.hash = 'evictions'; };
```

The existing `useEffect` on line 41 writes `activeTab` into the hash on every change and would fight the CRM route. Guard it:

```ts
  useEffect(() => {
    if (isCrmOpen) return;
    window.location.hash = activeTab;
  }, [activeTab, isCrmOpen]);
```

Render the workspace before the main return's JSX, inside the authenticated branch. Insert immediately after the `if (!isAuthenticated) { ... }` block:

```tsx
  if (isCrmOpen && hasGrant) {
    return <EvictionsCrmWorkspace onExit={exitEvictionsCrm} />;
  }
```

Pass the handler to `Header` on line 172:

```tsx
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} onTabChange={setActiveTab} onOpenEvictionsCrm={openEvictionsCrm} />
```

And render the gate dialog alongside the other modals at the bottom of the main return:

```tsx
      <PasswordGateDialog
        open={isGateOpen}
        onOpenChange={setIsGateOpen}
        onGranted={() => { grant(); setIsCrmOpen(true); window.location.hash = 'evictions-crm'; }}
      />
```

- [ ] **Step 5: Commit**

```bash
git add src/crm-evictions/shell src/components/layout/Header.tsx src/pages/Index.tsx
git commit -m "Add Evictions CRM workspace shell and menu entry"
```

---

### Task 9: Frontend — dashboard

**Files:**
- Create: `src/crm-evictions/dashboard/DashboardPage.tsx`
- Create: `src/crm-evictions/dashboard/KpiTiles.tsx`
- Create: `src/crm-evictions/dashboard/StageDistribution.tsx`

**Interfaces:**
- Consumes: `getStats` from `../api/evictionsCrm`, `CrmStats` from `../types/crm`, `STAGES` from `../constants`
- Produces: `DashboardPage({ onOpenPipeline })`, `KpiTiles({ stats })`, `StageDistribution({ stats, onSelectStage })`

- [ ] **Step 1: Write the KPI tiles**

Create `src/crm-evictions/dashboard/KpiTiles.tsx`:

```tsx
import type { CrmStats } from '../types/crm';

const tile = (label: string, value: number, hint: string, tone = 'text-foreground') => ({ label, value, hint, tone });

export function KpiTiles({ stats }: { stats: CrmStats }) {
  const tiles = [
    tile('Total leads', stats.total, 'all eviction landlords'),
    tile('New leads', stats.byStage['New Lead'] || 0, 'not yet worked'),
    tile('Contacted', stats.byStage['Contacted'] || 0, 'reached at least once'),
    tile('Appointments', stats.byStage['Appointment Scheduled'] || 0, 'scheduled'),
    tile('Follow-ups', stats.followUpsDue.next7, `${stats.followUpsDue.overdue} overdue`, stats.followUpsDue.overdue ? 'text-warning' : 'text-foreground'),
    tile('Active opportunities', stats.activeOpportunities, 'interested or under contract', 'text-success'),
    tile('Closed', stats.closedDeals, 'deals closed', 'text-success'),
    tile('Unassigned', stats.unassigned, 'no owner yet'),
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.label}</p>
          <p className={`text-2xl font-semibold mt-1 ${t.tone}`}>{t.value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the stage distribution**

Create `src/crm-evictions/dashboard/StageDistribution.tsx`:

```tsx
import { STAGES } from '../constants';
import type { CrmStats } from '../types/crm';

export function StageDistribution({ stats, onSelectStage }: { stats: CrmStats; onSelectStage?: (stage: string) => void }) {
  const max = Math.max(1, ...STAGES.map((s) => stats.byStage[s] || 0));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">Pipeline distribution</h3>
      <div className="space-y-1.5">
        {STAGES.map((stage) => {
          const count = stats.byStage[stage] || 0;
          return (
            <button
              key={stage}
              onClick={() => onSelectStage?.(stage)}
              className="w-full flex items-center gap-3 text-sm hover:bg-muted/40 rounded px-1 py-0.5"
            >
              <span className="w-40 shrink-0 text-left text-muted-foreground">{stage}</span>
              <span className="flex-1 h-2 rounded bg-muted overflow-hidden">
                <span className="block h-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
              </span>
              <span className="w-14 text-right font-medium">{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/crm-evictions/dashboard/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getStats } from '../api/evictionsCrm';
import type { CrmStats } from '../types/crm';
import { KpiTiles } from './KpiTiles';
import { StageDistribution } from './StageDistribution';

export function DashboardPage({ onOpenPipeline }: { onOpenPipeline: () => void }) {
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load stats'));
  }, []);

  if (error) return <div className="p-6"><div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div></div>;
  if (!stats) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Eviction landlord prospecting at a glance</p>
      </div>
      <KpiTiles stats={stats} />
      <div className="grid lg:grid-cols-2 gap-4">
        <StageDistribution stats={stats} onSelectStage={onOpenPipeline} />
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Assigned</h3>
          {stats.byAssignee.length === 0 && <p className="text-sm text-muted-foreground">No leads assigned yet.</p>}
          {stats.byAssignee.map((a) => (
            <div key={a.userId} className="flex justify-between text-sm py-1">
              <span>{a.username}</span>
              <span className="font-medium">{a.count.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm py-1 border-t mt-2 pt-2 text-muted-foreground">
            <span>Unassigned</span>
            <span className="font-medium">{stats.unassigned.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/crm-evictions/dashboard
git commit -m "Add Evictions CRM dashboard"
```

---

### Task 10: Frontend — pipeline board

**Files:**
- Create: `src/crm-evictions/pipeline/PipelinePage.tsx`
- Create: `src/crm-evictions/pipeline/StageColumn.tsx`
- Create: `src/crm-evictions/pipeline/LeadCard.tsx`

**Interfaces:**
- Consumes: `listLeads`, `patchLead` from `../api/evictionsCrm`; `STAGES`, `STAGE_TONE` from `../constants`; `Lead` from `../types/crm`
- Produces: `PipelinePage()`, `StageColumn({ stage, onLeadMoved })`, `LeadCard({ lead })`

- [ ] **Step 1: Write the lead card**

Create `src/crm-evictions/pipeline/LeadCard.tsx`:

```tsx
import { useDraggable } from '@dnd-kit/core';
import { Building2, User } from 'lucide-react';
import type { Lead } from '../types/crm';

export function LeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`rounded-md border bg-card p-2.5 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm font-medium leading-tight">{lead.name}</p>
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
        {lead.isCorporate ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
        <span>{lead.filingCount} filings</span>
        <span>·</span>
        <span>{lead.addressCount} addr</span>
      </div>
      {lead.assignedTo && <p className="text-[11px] text-primary mt-1">{lead.assignedTo.username}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write the column**

Create `src/crm-evictions/pipeline/StageColumn.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { listLeads } from '../api/evictionsCrm';
import type { Lead } from '../types/crm';
import { LeadCard } from './LeadCard';

const PAGE_SIZE = 25;

export function StageColumn({ stage, reloadKey }: { stage: string; reloadKey: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const data = await listLeads({ stage, page: targetPage, pageSize: PAGE_SIZE, corporate: 'all' });
      setLeads((prev) => (targetPage === 1 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [stage]);

  useEffect(() => { setPage(1); load(1); }, [load, reloadKey]);

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg border bg-card/40 flex flex-col max-h-full ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold">{stage}</span>
        <span className="text-[11px] text-muted-foreground">{total.toLocaleString()}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
        {loading && <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />}
        {!loading && leads.length < total && (
          <button
            onClick={() => { const next = page + 1; setPage(next); load(next); }}
            className="w-full text-[11px] text-primary py-1.5 hover:bg-muted/40 rounded"
          >
            Load {Math.min(PAGE_SIZE, total - leads.length)} more
          </button>
        )}
        {!loading && total === 0 && <p className="text-[11px] text-muted-foreground text-center py-4">Empty</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/crm-evictions/pipeline/PipelinePage.tsx`:

```tsx
import { useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { STAGES } from '../constants';
import { patchLead } from '../api/evictionsCrm';
import { StageColumn } from './StageColumn';

export function PipelinePage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = async (event: DragEndEvent) => {
    const leadId = String(event.active.id);
    const targetStage = event.over ? String(event.over.id) : '';
    if (!targetStage) return;

    try {
      await patchLead(leadId, { contactStage: targetStage });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move lead');
    }
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Drag a lead to change its stage</p>
      </div>
      {error && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto flex-1 pb-2">
          {STAGES.map((stage) => <StageColumn key={stage} stage={stage} reloadKey={reloadKey} />)}
        </div>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/crm-evictions/pipeline
git commit -m "Add Evictions CRM pipeline board"
```

---

### Task 11: Frontend — leads list and profile

**Files:**
- Create: `src/crm-evictions/leads/LeadsPage.tsx`
- Create: `src/crm-evictions/leads/LeadProfile.tsx`

**Interfaces:**
- Consumes: `listLeads`, `getLead`, `patchLead` from `../api/evictionsCrm`; `STAGES`, `STAGE_TONE`, `SERVICE_INTERESTS` from `../constants`
- Produces: `LeadsPage()`, `LeadProfile({ leadId, onClose, onSaved })`

- [ ] **Step 1: Write the profile**

Create `src/crm-evictions/leads/LeadProfile.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { getLead, patchLead } from '../api/evictionsCrm';
import { STAGES, SERVICE_INTERESTS } from '../constants';
import type { LeadDetail } from '../types/crm';

const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString() : '—');

export function LeadProfile({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);

  useEffect(() => { getLead(leadId).then(setLead); }, [leadId]);

  const save = async (data: Record<string, unknown>) => {
    if (!lead) return;
    await patchLead(lead.id, data);
    setLead({ ...lead, ...data } as LeadDetail);
    onSaved();
  };

  const toggleService = (value: string) => {
    if (!lead) return;
    let next = lead.serviceInterests || ['Undecided'];
    if (value === 'Undecided') next = ['Undecided'];
    else {
      next = next.filter((x) => x !== 'Undecided');
      next = next.includes(value) ? next.filter((x) => x !== value) : [...next, value];
      if (!next.length) next = ['Undecided'];
    }
    save({ serviceInterests: next });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {!lead ? <Loader2 className="h-6 w-6 animate-spin mx-auto my-12" /> : <>
          <DialogHeader>
            <DialogTitle>{lead.name}</DialogTitle>
            <DialogDescription>
              {lead.isCorporate ? 'Business entity' : 'Individual'} · {lead.filings.length} filings · {lead.addresses.length} properties
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="rounded-lg border p-3 space-y-3">
              <h3 className="text-sm font-semibold">Pipeline</h3>
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={lead.contactStage}
                onChange={(e) => save({ contactStage: e.target.value })}
              >
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                {SERVICE_INTERESTS.map((s) => (
                  <Button key={s} size="sm" variant={lead.serviceInterests?.includes(s) ? 'default' : 'outline'} onClick={() => toggleService(s)}>
                    {s}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Owner: {lead.assignedTo?.username || 'Unassigned'} · Next follow-up: {fmt(lead.nextFollowUpAt)}
              </p>
              <Textarea
                placeholder="Notes"
                value={lead.notes || ''}
                onChange={(e) => setLead({ ...lead, notes: e.target.value })}
                onBlur={() => save({ notes: lead.notes })}
              />
            </section>

            <section className="rounded-lg border p-3 space-y-2">
              <h3 className="text-sm font-semibold">Contacts</h3>
              {(lead.contacts?.phoneRows || []).flatMap((r) => r.phones.map((p, i) => (
                <div key={`${r.name}-${i}`} className="text-sm flex gap-2">
                  <span className="font-medium">{r.name || lead.name}</span>
                  <a className="text-primary" href={`tel:${p.number}`}>{p.number}</a>
                </div>
              )))}
              {(lead.contacts?.emailRows || []).flatMap((r) => r.emails.map((e) => (
                <div key={e} className="text-sm"><a className="text-primary" href={`mailto:${e}`}>{e}</a></div>
              )))}
              {!lead.contacts?.phoneRows?.length && !lead.contacts?.emailRows?.length && (
                <p className="text-sm text-muted-foreground">No contacts captured yet.</p>
              )}
            </section>
          </div>

          <section className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold mb-2">Properties</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {lead.addresses.map((a) => (
                <div key={a.id} className="rounded bg-muted/40 p-2 text-sm">{a.address}, {a.city}, {a.state} {a.zip}</div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold mb-2">Eviction filings</h3>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr>{['Case', 'Filed', 'Status', 'Precinct', 'Disposition'].map((h) => <th key={h} className="text-left p-2 text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {lead.filings.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="p-2">{f.caseNumber}</td>
                      <td className="p-2 whitespace-nowrap">{fmt(f.filedDate)}</td>
                      <td className="p-2">{f.caseStatus}</td>
                      <td className="p-2">{f.precinct}</td>
                      <td className="p-2">{f.disposition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold mb-2">Activity</h3>
            {lead.activities.length === 0 && <p className="text-sm text-muted-foreground">No activity logged.</p>}
            {lead.activities.slice(0, 15).map((a) => (
              <div key={a.id} className="text-sm border-l-2 pl-2 mb-2">
                <span className="font-medium capitalize">{a.kind}</span> · {fmt(a.createdAt)}
                <div className="text-muted-foreground">{a.body}</div>
              </div>
            ))}
          </section>
        </>}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the leads list**

Create `src/crm-evictions/leads/LeadsPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { listLeads } from '../api/evictionsCrm';
import { STAGES, STAGE_TONE, SERVICE_INTERESTS, type Stage } from '../constants';
import type { Lead } from '../types/crm';
import { LeadProfile } from './LeadProfile';

const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString() : '—');

export function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [service, setService] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await listLeads({ page, pageSize: 25, search, stage, service, corporate: 'all' });
      setItems(data.items); setTotal(data.total); setPages(data.pages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, stage, service]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">{total.toLocaleString()} eviction landlords</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Landlord or address" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={service} onChange={(e) => { setService(e.target.value); setPage(1); }}>
          <option value="">All services</option>
          {SERVICE_INTERESTS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>{['Landlord', 'Stage', 'Owner', 'Filings', 'Properties', 'Latest Filing', 'Next Follow-up'].map((h) => (
              <th key={h} className="px-3 py-3 font-medium whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr> : items.map((lead) => (
              <tr key={lead.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(lead.id)}>
                <td className="px-3 py-3 font-medium">{lead.name}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_TONE[lead.contactStage as Stage] || 'bg-muted text-muted-foreground'}`}>
                    {lead.contactStage}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{lead.assignedTo?.username || '—'}</td>
                <td className="px-3 py-3">{lead.filingCount}</td>
                <td className="px-3 py-3">{lead.addressCount}</td>
                <td className="px-3 py-3 whitespace-nowrap">{fmt(lead.latestFilingDate)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{fmt(lead.nextTask?.dueAt)}</td>
              </tr>
            ))}
            {!loading && !items.length && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {openId && <LeadProfile leadId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS, 9 tests across two files.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Verify the workspace renders**

Run `npm run dev`, sign in, open Menu → "Login to Evictions CRM", enter your password. Confirm the sidebar renders, the dashboard loads real counts, the pipeline shows 12 columns with counts, and clicking a lead in Leads opens the profile.

- [ ] **Step 6: Commit**

```bash
git add src/crm-evictions/leads
git commit -m "Add Evictions CRM leads list and lead profile"
```

---

## Self-Review Notes

**Spec coverage:** workspace shell (Task 8), password gate (Tasks 3, 7), dashboard with all seven KPIs (Task 9), 12-stage pipeline (Tasks 1, 2, 10), landlord profile with identity/contacts/properties/filings/service interest/assignee/follow-up/notes/activity (Task 11), shared-record sync (Task 2 — structural, no code), stage migration (Task 2), corporate visibility (Task 5), assignment (Tasks 2, 5, 11), Vitest (Tasks 1, 7).

**Known ordering constraint:** Task 8 creates a file importing three pages that do not exist until Tasks 9-11. The build will fail between Task 8 and Task 11. This is called out inline in Task 8, Step 2. Do not run `npm run build` between those tasks.

**Deliberately deferred to Phase 2/3:** appointments as calendar events, communication logs, follow-up sequences, saved filters, tagging, bulk actions, CSV export, reporting, and cross-field search over phone/email/case number. The Leads search box passes `search` to the existing endpoint, which matches name and property address only.
