# Pipeline Work Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Evictions CRM's 12-column drag-and-drop kanban with a work queue — seven tabs with server-side counts over a filterable table — so the screen answers "who do I call now" instead of "where is everything".

**Architecture:** One shared queue-filter builder on the backend serves both the row query and the counts query, so a tab's number can never disagree with what opening that tab shows. `Parked` becomes a `parkedAt` timestamp independent of `contactStage`, so parking a lead does not destroy the stage it had reached. The frontend replaces three kanban files with a table and a tab strip.

**Tech Stack:** Express + Prisma + PostgreSQL, Vite + React 18 + TypeScript + Tailwind, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-24-corporate-crm-port-design.md`

## Global Constraints

- **Seven queues**, with these exact meanings:
  - `all` — everything matching the filters
  - `needsContact` — never contacted (`lastContactedAt` is null)
  - `overdue` — `nextFollowUpAt` before today
  - `dueToday` — `nextFollowUpAt` falls today
  - `upcoming` — `nextFollowUpAt` after today
  - `parked` — `parkedAt` is set
  - `closed` — `contactStage` is `Closed`
- **The four active queues (`needsContact`, `overdue`, `dueToday`, `upcoming`) exclude parked and closed leads.** A lead deliberately set aside, or finished, is not work to do now. `all` excludes nothing.
- **Day boundaries are UTC**, matching the existing `/stats` endpoint. Local-time boundaries put follow-ups in the wrong bucket for users east or west of the server.
- **`LAST CONTACT` renders `Never`, never a dash or blank.** An absence stated, not a hole.
- **`NEXT FOLLOW-UP` renders relative — `14d overdue`, `Today`, `in 3d`** — never a raw date. Urgency without the reader doing arithmetic.
- **Monospace (`.record`) for record values only** — counts, dates, relative times. Never for names, stages, or labels.
- Field labels and table headers use `.label` (10px, 0.13em tracking, uppercase, weight 600).
- Columns, in order: `OWNER`, `FILINGS`, `DOORS`, `STAGE`, `LAST CONTACT`, `NEXT FOLLOW-UP`, `ASSIGNED`, row action.
- `DOORS` is the landlord's `addressCount`.
- The CRM requests `corporate: 'all'` — business-entity landlords are visible here, unlike the Eviction List tab.
- The repo has many pre-existing TypeScript errors in unrelated files; `npx tsc --noEmit` exits non-zero on a clean checkout. Judge by `npm run build`, `npm test`, and a filtered tsc.
- Backend is CommonJS; frontend is ESM. Path alias `@/` → `src/`.
- Do not run `prisma migrate deploy` locally — there is no local database.
- Commit after every task.

---

### Task 1: Parked state and the queue-filtered backend

**Files:**
- Create: `functions/prisma/migrations/20260825000000_add_eviction_parked_at/migration.sql`
- Modify: `functions/prisma/schema.prisma` (EvictionLandlord model)
- Modify: `functions/src/routes/evictions.js` (add the queue builder, the counts route, and the `queue` param on `/landlords`; extend the PATCH allowlist)

**Interfaces:**
- Consumes: nothing
- Produces: `GET /api/evictions/pipeline/counts` returning `{ all, needsContact, overdue, dueToday, upcoming, parked, closed }`; a `queue` query param on `GET /api/evictions/landlords`; `parkedAt` accepted by `PATCH /api/evictions/landlords/:id`; `parkedAt` on each returned landlord

- [ ] **Step 1: Write the migration**

Create `functions/prisma/migrations/20260825000000_add_eviction_parked_at/migration.sql`:

```sql
-- Parking is "not now", which is different from a stage. Keeping it in its own
-- column means a parked lead retains whatever stage it had reached, so
-- un-parking restores the real position instead of guessing one.
ALTER TABLE "eviction_landlords" ADD COLUMN "parkedAt" TIMESTAMP(3);

-- The parked queue filters on this, and the four active queues exclude on it.
CREATE INDEX "eviction_landlords_parkedAt_idx" ON "eviction_landlords"("parkedAt");

-- Every active queue also filters on the follow-up date.
CREATE INDEX "eviction_landlords_nextFollowUpAt_idx" ON "eviction_landlords"("nextFollowUpAt");
```

- [ ] **Step 2: Update the Prisma schema**

In `functions/prisma/schema.prisma`, in the `EvictionLandlord` model, add `parkedAt` immediately after `nextFollowUpAt`:

```prisma
  parkedAt         DateTime?
```

And add these two lines to that model's index block, beside the existing `@@index([assignedToId])`:

```prisma
  @@index([parkedAt])
  @@index([nextFollowUpAt])
```

- [ ] **Step 3: Validate the schema**

Run: `cd functions && DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate`
Expected: "The schema at prisma\schema.prisma is valid".

Then: `cd functions && DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Add the shared queue-filter builder**

In `functions/src/routes/evictions.js`, immediately above the `router.get('/stats', ...)` route, add:

```js
/**
 * Prisma `where` fragments for the pipeline's work queues.
 *
 * One builder serves both the row query and the counts query, so a tab's number
 * can never disagree with what opening that tab shows.
 *
 * Boundaries are UTC to match /stats. The four active queues exclude parked and
 * closed leads: something deliberately set aside, or finished, is not work to
 * do now. `all` excludes nothing.
 */
const queueFilter = (queue) => {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(now); endOfToday.setUTCHours(23, 59, 59, 999);
  const active = { parkedAt: null, contactStage: { not: 'Closed' } };

  switch (queue) {
    case 'needsContact': return { ...active, lastContactedAt: null };
    case 'overdue':      return { ...active, nextFollowUpAt: { lt: startOfToday } };
    case 'dueToday':     return { ...active, nextFollowUpAt: { gte: startOfToday, lte: endOfToday } };
    case 'upcoming':     return { ...active, nextFollowUpAt: { gt: endOfToday } };
    case 'parked':       return { parkedAt: { not: null } };
    case 'closed':       return { contactStage: 'Closed' };
    default:             return {};
  }
};

const QUEUES = ['all', 'needsContact', 'overdue', 'dueToday', 'upcoming', 'parked', 'closed'];
```

- [ ] **Step 5: Add the counts route**

Directly below the builder you just added, add:

```js
router.get('/pipeline/counts', async (req, res) => {
  try {
    // The same filters the table uses, minus the queue itself — each tab counts
    // its own slice of the current filter set.
    const base = {};
    if (req.query.corporate === 'all') { /* no filter */ }
    else if (req.query.corporate === 'true') base.isCorporate = true;
    else base.isCorporate = false;

    if (req.query.assignedTo === 'unassigned') base.assignedToId = null;
    else if (req.query.assignedTo) base.assignedToId = String(req.query.assignedTo);
    if (req.query.service) base.serviceInterests = { has: String(req.query.service) };
    if (req.query.search) {
      base.OR = [
        { name: { contains: String(req.query.search), mode: 'insensitive' } },
        { addresses: { some: { address: { contains: String(req.query.search), mode: 'insensitive' } } } },
      ];
    }

    const counts = await Promise.all(
      QUEUES.map((q) => prisma.evictionLandlord.count({ where: { ...base, ...queueFilter(q) } }))
    );

    res.json(Object.fromEntries(QUEUES.map((q, i) => [q, counts[i]])));
  } catch (error) {
    console.error('[EVICTIONS] pipeline counts error:', error);
    res.status(500).json({ error: 'Unable to load pipeline counts' });
  }
});
```

- [ ] **Step 6: Accept `queue` on the landlords route, and `parkedAt` on PATCH**

In `functions/src/routes/evictions.js`, in the `/landlords` route, immediately after the line that reads `if (req.query.service) where.serviceInterests = { has: String(req.query.service) };`, add:

```js
  if (req.query.queue && req.query.queue !== 'all') Object.assign(where, queueFilter(String(req.query.queue)));
```

In the same route's `findMany` `select`/`include`, no change is needed — `parkedAt` is a scalar and is returned by default.

In the PATCH route, extend the allowlist to include `parkedAt`, so it reads:

```js
  const allowed = ['contactStage', 'serviceInterests', 'contacts', 'notes', 'lastContactedAt', 'nextFollowUpAt', 'assignedToId', 'parkedAt'];
```

`parkedAt` ends in `At`, so the route's existing date-coercion branch converts it correctly, and passing `null` un-parks.

- [ ] **Step 7: Verify the file parses**

Run: `node --check functions/src/routes/evictions.js`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add functions/prisma/schema.prisma functions/prisma/migrations/20260825000000_add_eviction_parked_at/migration.sql functions/src/routes/evictions.js
git commit -m "Add parked state and queue-filtered pipeline endpoints"
```

---

### Task 2: Queue definitions and relative-time labels

**Files:**
- Create: `src/crm-evictions/pipeline/queues.ts`
- Create: `src/crm-evictions/pipeline/queues.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `QUEUES` (ordered array of `{ id, label }`), `type QueueId`, `lastContactLabel(iso, now)`, `followUpLabel(iso, now)`

- [ ] **Step 1: Write the failing test**

Create `src/crm-evictions/pipeline/queues.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { QUEUES, lastContactLabel, followUpLabel } from './queues';

const now = new Date('2026-08-25T12:00:00Z');

describe('QUEUES', () => {
  it('lists the seven queues in display order', () => {
    expect(QUEUES.map((q) => q.id)).toEqual([
      'all', 'needsContact', 'overdue', 'dueToday', 'upcoming', 'parked', 'closed',
    ]);
  });

  it('labels them for the tab strip', () => {
    expect(QUEUES.map((q) => q.label)).toEqual([
      'All', 'Needs contact', 'Overdue', 'Due today', 'Upcoming', 'Parked', 'Closed',
    ]);
  });
});

describe('lastContactLabel', () => {
  it('states the absence rather than leaving a blank', () => {
    expect(lastContactLabel(null, now)).toBe('Never');
    expect(lastContactLabel(undefined, now)).toBe('Never');
  });

  it('counts whole days back', () => {
    expect(lastContactLabel('2026-08-25T09:00:00Z', now)).toBe('Today');
    expect(lastContactLabel('2026-08-24T09:00:00Z', now)).toBe('1d ago');
    expect(lastContactLabel('2026-08-11T09:00:00Z', now)).toBe('14d ago');
  });
});

describe('followUpLabel', () => {
  it('renders nothing scheduled as an em dash', () => {
    expect(followUpLabel(null, now)).toBe('—');
  });

  it('renders overdue as elapsed days, not a date', () => {
    expect(followUpLabel('2026-08-11T09:00:00Z', now)).toBe('14d overdue');
    expect(followUpLabel('2026-08-24T09:00:00Z', now)).toBe('1d overdue');
  });

  it('names today rather than counting zero days', () => {
    expect(followUpLabel('2026-08-25T18:00:00Z', now)).toBe('Today');
  });

  it('renders upcoming as days ahead', () => {
    expect(followUpLabel('2026-08-28T09:00:00Z', now)).toBe('in 3d');
  });

  it('compares whole UTC days, so a late-evening follow-up today is not overdue', () => {
    expect(followUpLabel('2026-08-25T00:30:00Z', now)).toBe('Today');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/crm-evictions/pipeline/queues.test.ts`
Expected: FAIL — cannot resolve `./queues`.

- [ ] **Step 3: Write the implementation**

Create `src/crm-evictions/pipeline/queues.ts`:

```ts
/**
 * The pipeline's work queues and the relative-time labels its table renders.
 *
 * Both label helpers compare whole UTC days rather than elapsed milliseconds:
 * a follow-up set for 00:30 today is due today, not eighteen hours overdue.
 * UTC matches the backend's queue boundaries, so a row's label and the tab it
 * appears under always agree.
 */

export const QUEUES = [
  { id: 'all', label: 'All' },
  { id: 'needsContact', label: 'Needs contact' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'dueToday', label: 'Due today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'parked', label: 'Parked' },
  { id: 'closed', label: 'Closed' },
] as const;

export type QueueId = (typeof QUEUES)[number]['id'];

/** Whole UTC days from `a` to `b`; negative when `b` is earlier. */
const dayDelta = (a: Date, b: Date): number => {
  const dayA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dayB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((dayB - dayA) / 86_400_000);
};

/**
 * "Never" is deliberate. A dash reads as missing data; "Never" reads as a fact
 * about the lead, which is what it is.
 */
export const lastContactLabel = (iso: string | null | undefined, now = new Date()): string => {
  if (!iso) return 'Never';
  const days = dayDelta(new Date(iso), now);
  if (days <= 0) return 'Today';
  return `${days}d ago`;
};

/** Relative, so urgency reads without the viewer doing date arithmetic. */
export const followUpLabel = (iso: string | null | undefined, now = new Date()): string => {
  if (!iso) return '—';
  const days = dayDelta(now, new Date(iso));
  if (days === 0) return 'Today';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- src/crm-evictions/pipeline/queues.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/crm-evictions/pipeline/queues.ts src/crm-evictions/pipeline/queues.test.ts
git commit -m "Add pipeline queue definitions and relative-time labels"
```

---

### Task 3: The queue tab strip and the pipeline table

**Files:**
- Create: `src/crm-evictions/pipeline/QueueTabs.tsx`
- Create: `src/crm-evictions/pipeline/PipelineTable.tsx`
- Modify: `src/crm-evictions/types/crm.ts` (add `parkedAt` to `Lead`, add `PipelineCounts`)
- Modify: `src/crm-evictions/api/evictionsCrm.ts` (add `getPipelineCounts`, extend `ListLeadsParams`)

**Interfaces:**
- Consumes: `QUEUES`, `QueueId`, `lastContactLabel`, `followUpLabel` from `./queues`; `Lead` from `../types/crm`
- Produces: `QueueTabs({ active, counts, onChange })`, `PipelineTable({ leads, loading, onOpen })`, `getPipelineCounts(params)`, `PipelineCounts`

- [ ] **Step 1: Extend the types**

In `src/crm-evictions/types/crm.ts`, add `parkedAt` to the `Lead` type, immediately after `nextFollowUpAt`:

```ts
  parkedAt?: string | null;
```

And add this type at the end of the file:

```ts
export type PipelineCounts = {
  all: number;
  needsContact: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  parked: number;
  closed: number;
};
```

- [ ] **Step 2: Extend the API client**

In `src/crm-evictions/api/evictionsCrm.ts`, add `queue` to `ListLeadsParams` in `types/crm.ts`:

```ts
  queue?: string;
```

Then add this function to `evictionsCrm.ts`, below `listLeads`:

```ts
export const getPipelineCounts = (params: ListLeadsParams = {}) => {
  const query = new URLSearchParams();
  // The counts endpoint applies every filter except the queue, since each tab
  // counts its own slice of the same filter set.
  Object.entries(params).forEach(([key, value]) => {
    if (key !== 'queue' && key !== 'page' && key !== 'pageSize' && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return request<PipelineCounts>(`/api/evictions/pipeline/counts${suffix ? `?${suffix}` : ''}`);
};
```

Add `PipelineCounts` to that file's type import.

- [ ] **Step 3: Build the tab strip**

Create `src/crm-evictions/pipeline/QueueTabs.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { QUEUES, type QueueId } from './queues';
import type { PipelineCounts } from '../types/crm';

/**
 * The counts are the point of this strip: they say where the work is before
 * anything is clicked. Overdue carries the one non-greyscale treatment, because
 * it is the only queue that means "you are late".
 */
export function QueueTabs({
  active,
  counts,
  onChange,
}: {
  active: QueueId;
  counts: PipelineCounts | null;
  onChange: (queue: QueueId) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Work queues">
      {QUEUES.map((q) => {
        const isActive = active === q.id;
        const count = counts ? counts[q.id] : null;
        const isOverdue = q.id === 'overdue' && (count ?? 0) > 0;
        return (
          <button
            key={q.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(q.id)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              isActive
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
              isOverdue && !isActive && 'text-destructive'
            )}
          >
            {q.label}
            {count !== null && <span className="record text-xs text-muted-foreground">{count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Build the table**

Create `src/crm-evictions/pipeline/PipelineTable.tsx`:

```tsx
import { Loader2 } from 'lucide-react';
import { STAGE_TONE, type Stage } from '../constants';
import type { Lead } from '../types/crm';
import { lastContactLabel, followUpLabel } from './queues';

const COLUMNS = ['Owner', 'Filings', 'Doors', 'Stage', 'Last contact', 'Next follow-up', 'Assigned', ''];

export function PipelineTable({
  leads,
  loading,
  onOpen,
}: {
  leads: Lead[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded border bg-card overflow-x-auto">
      <table className="data-table w-full">
        <thead>
          <tr>{COLUMNS.map((c, i) => <th key={c || `action-${i}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={COLUMNS.length} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
          )}

          {!loading && leads.map((lead) => {
            const overdue = followUpLabel(lead.nextFollowUpAt).endsWith('overdue');
            return (
              <tr key={lead.id} className="cursor-pointer" onClick={() => onOpen(lead.id)}>
                <td className="font-medium">{lead.name}</td>
                <td className="record">{lead.filingCount}</td>
                <td className="record">{lead.addressCount}</td>
                <td>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_TONE[lead.contactStage as Stage] || 'bg-muted text-muted-foreground'}`}>
                    {lead.contactStage}
                  </span>
                </td>
                <td className="record text-muted-foreground">{lastContactLabel(lead.lastContactedAt)}</td>
                <td className={`record ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {followUpLabel(lead.nextFollowUpAt)}
                </td>
                <td className="text-muted-foreground">{lead.assignedTo?.username || '—'}</td>
                <td>
                  <span className="label rounded border px-2 py-1">Open</span>
                </td>
              </tr>
            );
          })}

          {!loading && !leads.length && (
            <tr><td colSpan={COLUMNS.length} className="py-12 text-center text-muted-foreground">Nothing in this queue.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Verify types and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "QueueTabs|PipelineTable|evictionsCrm|crm.ts"`
Expected: no output.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/crm-evictions/pipeline/QueueTabs.tsx src/crm-evictions/pipeline/PipelineTable.tsx src/crm-evictions/types/crm.ts src/crm-evictions/api/evictionsCrm.ts
git commit -m "Add the queue tab strip and pipeline table"
```

---

### Task 4: Swap the page over and retire the kanban

**Files:**
- Modify: `src/crm-evictions/pipeline/PipelinePage.tsx` (rewritten)
- Delete: `src/crm-evictions/pipeline/StageColumn.tsx`
- Delete: `src/crm-evictions/pipeline/LeadCard.tsx`
- Modify: `package.json` (drop `@dnd-kit` dependencies if nothing else uses them)

**Interfaces:**
- Consumes: `QueueTabs`, `PipelineTable`, `QUEUES`, `QueueId`, `getPipelineCounts`, `listLeads`
- Produces: the rebuilt `PipelinePage()`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/crm-evictions/pipeline/PipelinePage.tsx` with:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { listLeads, getPipelineCounts } from '../api/evictionsCrm';
import { SERVICE_INTERESTS } from '../constants';
import type { Lead, PipelineCounts } from '../types/crm';
import { ErrorBanner } from '../components/ErrorBanner';
import { LeadProfile } from '../leads/LeadProfile';
import { QueueTabs } from './QueueTabs';
import { PipelineTable } from './PipelineTable';
import type { QueueId } from './queues';

export function PipelinePage() {
  const [queue, setQueue] = useState<QueueId>('needsContact');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const params = { queue, search, service, corporate: 'all' as const, page: 1, pageSize: 100 };
      const [rows, tallies] = await Promise.all([listLeads(params), getPipelineCounts(params)]);
      if (requestSeq.current !== requestId) return; // superseded by a newer request
      setLeads(rows.items);
      setTotal(rows.total);
      setCounts(tallies);
    } catch (e) {
      if (requestSeq.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Unable to load the pipeline');
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [queue, search, service]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-1">Bexar County · Eviction filings</p>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
        </div>
        <p className="record text-sm text-muted-foreground">
          {counts ? `${counts.all.toLocaleString()} owners` : ' '}
        </p>
      </div>

      <QueueTabs active={queue} counts={counts} onChange={setQueue} />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_240px_auto] md:items-center">
        <Input
          placeholder="Search owner or mailing address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded border bg-card px-3 text-sm"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">All services</option>
          {SERVICE_INTERESTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <p className="record text-sm text-muted-foreground md:justify-self-end">
          {loading ? ' ' : `${leads.length.toLocaleString()} of ${total.toLocaleString()}`}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <PipelineTable leads={leads} loading={loading} onOpen={setOpenId} />

      {openId && <LeadProfile leadId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </div>
  );
}
```

- [ ] **Step 2: Delete the kanban files**

```bash
git rm src/crm-evictions/pipeline/StageColumn.tsx src/crm-evictions/pipeline/LeadCard.tsx
```

- [ ] **Step 3: Check whether @dnd-kit is still used**

Run:

```bash
grep -rn "@dnd-kit" src/ --include=*.tsx --include=*.ts | grep -v node_modules
```

If that returns nothing, remove the three `@dnd-kit` entries from `package.json`'s `dependencies` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) and run `npm install` to update the lockfile. If it returns hits, leave `package.json` alone and note which files still use it in your report.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Pipeline|StageColumn|LeadCard"` — expected: no output.
Run: `npm test` — expected: all pass (27 existing + 8 from Task 2 = 35).
Run: `npm run build` — expected: exit 0.

Confirm nothing still imports the deleted files:

```bash
grep -rn "StageColumn\|LeadCard" src/ --include=*.tsx --include=*.ts | grep -v node_modules
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A src/ package.json package-lock.json
git commit -m "Replace the kanban board with the pipeline work queue"
```

---

## Self-Review Notes

**Spec coverage:** seven queues with server-side counts (Tasks 1, 3); the active-queue exclusion rule (Task 1); UTC boundaries (Tasks 1, 2); `LAST CONTACT` as "Never" and `NEXT FOLLOW-UP` as relative (Task 2, rendered in Task 3); the column set including `DOORS` as `addressCount` (Task 3); the filter bar with search over name and mailing address plus a result count (Task 4); `Parked` as `parkedAt` independent of stage (Task 1); kanban replaced (Task 4).

**Deliberately not in this plan:** the `ASSIGNED` column is display-only — there is no assignment UI yet, and adding one is its own change. Sorting by filing volume is not implemented; the backend orders by `updatedAt desc` and adding a sort parameter is a follow-up. Neither appears in the spec's must-have list.

**A limitation worth stating plainly:** Task 4 loads up to 100 rows and shows "N of total". That is a deliberate simplification over paging — the queues are meant to be worked down, and a queue with thousands of rows is a signal to filter rather than to paginate. If `needsContact` genuinely sits at 8,000 after the import lands, revisit this.

**The `FILINGS` column depends on the import fix.** Until the filings phase actually completes, that column reads 0 for every row. The fix is merged but its effect needs an import run.
