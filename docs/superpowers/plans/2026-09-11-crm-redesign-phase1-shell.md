# CRM Redesign Phase 1 (Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `NavRail`+`Header` with a cohesive `AppShell` (widened,
labeled, branded `Sidebar` + a `TopBar` with real cross-domain search and a
real notifications feed), and fold mobile nav into a `TopBar` dropdown sheet.

**Architecture:** Two new backend routes (`/api/search`, `/api/notifications`)
each backed by a pure, unit-tested `lib/` module (existing codebase
convention — route files aren't unit-testable, since they construct a
`PrismaClient` at require time). Frontend: a small sessionStorage-backed
`pendingSearch` signal lets a search-result click seed an existing view's
own search box without this phase needing to understand each view's
internals; a new `GlobalSearchDialog` (built on already-present, currently
unused `cmdk`/`command.tsx` primitives) is the ⌘K search UI; `Sidebar` and
`TopBar` replace `NavRail`/`Header` entirely and are composed by a new
`AppShell` that `Index.tsx` wraps its content in.

**Tech Stack:** React 19 + TypeScript + Tailwind (Vite) frontend; Express +
Prisma 5.22.0 + PostgreSQL backend (Railway). No new npm dependencies — `cmdk`
is already installed but unused.

**Spec:** `docs/superpowers/specs/2026-09-11-crm-redesign-phase1-shell-design.md`

## Global Constraints

- No new Prisma models or migrations — both new endpoints query existing tables.
- `Property` and `PreForeclosure` are shared/team-wide (not scoped to `userId`) — match this, don't invent new scoping. `CrmLead` and `MlsLead` already scope to `userId` — match that too.
- No new backend infrastructure for notifications — no read/unread state, recomputed live every request.
- Route files (`functions/src/routes/*.js`) are not unit-tested — testable logic lives in `functions/src/lib/*.js` modules instead (see `crmScope.js`'s header comment for why).
- Run the full test suite (`npx vitest run` from repo root), `npx tsc --noEmit`, and `npm run build` before every commit that touches frontend code — this session's established convention.
- Work happens directly on `main`, no worktree/branch — this session's established convention for this repo (every prior feature this session shipped this way).
- Deploy at the very end only, after all tasks pass final review: frontend via `git push origin main` (GitHub Actions → GitHub Pages), backend via `railway up --service county-cad-tracker --ci` from the `functions/` directory. Verify both are healthy after (curl the root URL; `gh run watch` the Pages workflow).

---

### Task 1: Design token and AvatarInitials primitive

**Deviation from the spec:** the spec (see "New shared primitives") also
describes a `Pill` component for this phase. Writing this plan surfaced
that nothing in Phase 1's own UI (Sidebar, TopBar, GlobalSearchDialog)
actually renders a status pill — search results and notifications are
plain text. Building `Pill` now with no real caller in this phase would be
exactly the speculative-abstraction anti-pattern this codebase's own
conventions warn against. `Pill` is cut from this task; a later phase that
actually has status pills to render (Contacts' Warm/Active/Cold, most
likely) should add it then, sized to what it actually needs at that point.

**Files:**
- Modify: `src/index.css:81`
- Create: `src/components/ui/avatar-initials.tsx`
- Create: `src/components/ui/avatar-initials.test.tsx`

**Interfaces:**
- Produces: `AvatarInitials({ name: string; size?: number })`, default `size` 32. Task 5 (Sidebar) renders this in the user footer.

- [ ] **Step 1: Change the `--radius` token**

In `src/index.css` line 81, change:

```css
    --radius: 0.25rem;
```

to:

```css
    --radius: 0.625rem;
```

Do not change any other line in this file. This is the only step for this
change — `tailwind.config.ts` already derives every corner-radius Tailwind
class from this one custom property, so no other file needs touching.

- [ ] **Step 2: Write the failing test for AvatarInitials**

Create `src/components/ui/avatar-initials.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvatarInitials } from './avatar-initials'

describe('AvatarInitials', () => {
  it('renders the first two letters of a single-word name, uppercased', () => {
    render(<AvatarInitials name="cher" />)
    expect(screen.getByText('CH')).toBeTruthy()
  })

  it('renders first+last initials for a multi-word name', () => {
    render(<AvatarInitials name="Raul Medina" />)
    expect(screen.getByText('RM')).toBeTruthy()
  })

  it('renders "?" for an empty name', () => {
    render(<AvatarInitials name="" />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('is deterministic: the same name renders the same background color across two renders', () => {
    const { unmount } = render(<AvatarInitials name="Raul Medina" />)
    const firstColor = screen.getByText('RM').style.backgroundColor
    unmount()
    render(<AvatarInitials name="Raul Medina" />)
    const secondColor = screen.getByText('RM').style.backgroundColor
    expect(firstColor).toBe(secondColor)
    expect(firstColor).not.toBe('')
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/components/ui/avatar-initials.test.tsx`
Expected: FAIL — `./avatar-initials` module not found.

- [ ] **Step 4: Implement AvatarInitials**

Create `src/components/ui/avatar-initials.tsx`:

```tsx
const PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AvatarInitials({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, backgroundColor: colorForName(name), fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initialsForName(name)}
    </span>
  )
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `npx vitest run src/components/ui/avatar-initials.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Full check and commit**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run && npx tsc --noEmit`
Expected: all existing tests still pass (this step only added tests, changed
one CSS custom property, and added one new unused-elsewhere-yet component —
nothing else should be affected), typecheck clean.

```bash
git add src/index.css src/components/ui/avatar-initials.tsx src/components/ui/avatar-initials.test.tsx
git commit -m "Add AvatarInitials primitive, soften --radius token"
```

---

### Task 2: Backend search and notifications endpoints

**Files:**
- Create: `functions/src/lib/searchResults.js`
- Create: `functions/src/lib/searchResults.test.js`
- Create: `functions/src/routes/search.js`
- Create: `functions/src/lib/notificationFeed.js`
- Create: `functions/src/lib/notificationFeed.test.js`
- Create: `functions/src/routes/notifications.js`
- Modify: `functions/src/index.js`

**Interfaces:**
- Produces: `GET /api/search?q=<string>` → `{ results: SearchResultItem[] }` where each item is `{ type: 'property'|'preforeclosure'|'crmLead'|'mlsLead', id: string, label: string, sublabel: string, tab: string }`.
- Produces: `GET /api/notifications` → `{ notifications: NotificationItem[], count: number }` where each item is `{ type: 'followup'|'inbox', id: string, message: string, timestamp: string, tab: string }`.
- Both require a valid `Authorization: Bearer <token>` header (via `authenticateToken`), same as every other `/api/*` route in this codebase.

- [ ] **Step 1: Write the failing test for searchResults.js**

Create `functions/src/lib/searchResults.test.js`:

```js
const { describe, it, expect } = require('vitest');
const {
  MIN_QUERY_LENGTH,
  isQueryTooShort,
  mapPropertyResult,
  mapPreForeclosureResult,
  mapCrmLeadResult,
  mapMlsLeadResult,
} = require('./searchResults');

describe('isQueryTooShort', () => {
  it('is true for undefined, empty, whitespace-only, and 1-character queries', () => {
    expect(isQueryTooShort(undefined)).toBe(true);
    expect(isQueryTooShort('')).toBe(true);
    expect(isQueryTooShort('  ')).toBe(true);
    expect(isQueryTooShort('a')).toBe(true);
  });

  it('is false at and above MIN_QUERY_LENGTH', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(isQueryTooShort('ab')).toBe(false);
    expect(isQueryTooShort('abc')).toBe(false);
  });
});

describe('result mappers', () => {
  it('maps a property row', () => {
    expect(mapPropertyResult({ id: 'p1', propertyAddress: '123 Main St', ownerName: 'Jane Doe' })).toEqual({
      type: 'property', id: 'p1', label: '123 Main St', sublabel: 'Jane Doe', tab: 'properties',
    });
  });

  it('falls back to ownerName as the label when propertyAddress is blank', () => {
    expect(mapPropertyResult({ id: 'p2', propertyAddress: '', ownerName: 'Jane Doe' }).label).toBe('Jane Doe');
  });

  it('maps a pre-foreclosure row', () => {
    expect(mapPreForeclosureResult({ id: 'f1', address: '456 Oak Ave', city: 'San Antonio' })).toEqual({
      type: 'preforeclosure', id: 'f1', label: '456 Oak Ave', sublabel: 'San Antonio', tab: 'preforeclosure',
    });
  });

  it('maps a CRM lead row, preferring ownerName then businessName, phone then email', () => {
    expect(mapCrmLeadResult({ id: 'c1', ownerName: 'Sam Lee', businessName: '', phone: '2105551212', email: '' })).toEqual({
      type: 'crmLead', id: 'c1', label: 'Sam Lee', sublabel: '2105551212', tab: 'crm',
    });
    expect(mapCrmLeadResult({ id: 'c2', ownerName: '', businessName: 'Acme LLC', phone: '', email: 'a@b.com' })).toEqual({
      type: 'crmLead', id: 'c2', label: 'Acme LLC', sublabel: 'a@b.com', tab: 'crm',
    });
  });

  it('maps an MLS lead row', () => {
    expect(mapMlsLeadResult({ id: 'm1', address: '789 Elm St', status: 'ACT' })).toEqual({
      type: 'mlsLead', id: 'm1', label: '789 Elm St', sublabel: 'ACT', tab: 'mls',
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run functions/src/lib/searchResults.test.js`
Expected: FAIL — `./searchResults` module not found.

- [ ] **Step 3: Implement searchResults.js**

Create `functions/src/lib/searchResults.js`:

```js
const MIN_QUERY_LENGTH = 2;

function isQueryTooShort(q) {
  return typeof q !== 'string' || q.trim().length < MIN_QUERY_LENGTH;
}

function mapPropertyResult(p) {
  return { type: 'property', id: p.id, label: p.propertyAddress || p.ownerName, sublabel: p.ownerName, tab: 'properties' };
}
function mapPreForeclosureResult(p) {
  return { type: 'preforeclosure', id: p.id, label: p.address, sublabel: p.city, tab: 'preforeclosure' };
}
function mapCrmLeadResult(l) {
  return { type: 'crmLead', id: l.id, label: l.ownerName || l.businessName, sublabel: l.phone || l.email, tab: 'crm' };
}
function mapMlsLeadResult(m) {
  return { type: 'mlsLead', id: m.id, label: m.address, sublabel: m.status, tab: 'mls' };
}

module.exports = {
  MIN_QUERY_LENGTH,
  isQueryTooShort,
  mapPropertyResult,
  mapPreForeclosureResult,
  mapCrmLeadResult,
  mapMlsLeadResult,
};
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run functions/src/lib/searchResults.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Create the search route**

Create `functions/src/routes/search.js`:

```js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const {
  isQueryTooShort,
  mapPropertyResult,
  mapPreForeclosureResult,
  mapCrmLeadResult,
  mapMlsLeadResult,
} = require('../lib/searchResults');

router.use(authenticateToken);

// Property and PreForeclosure are shared/team-wide today (not yet scoped to
// userId — see the data-isolation epic noted in this phase's spec). CrmLead
// and MlsLead already are. This matches, not invents, the app's current
// per-model scoping.
router.get('/', async (req, res) => {
  const q = req.query.q;
  if (isQueryTooShort(q)) return res.json({ results: [] });

  const contains = { contains: q.trim(), mode: 'insensitive' };
  const userId = req.user.id;

  try {
    const [properties, preforeclosures, crmLeads, mlsLeads] = await Promise.all([
      prisma.property.findMany({
        where: { OR: [{ propertyAddress: contains }, { ownerName: contains }, { accountNumber: contains }] },
        take: 5,
        select: { id: true, propertyAddress: true, ownerName: true },
      }),
      prisma.preForeclosure.findMany({
        where: { OR: [{ address: contains }, { city: contains }, { documentNumber: contains }] },
        take: 5,
        select: { id: true, address: true, city: true },
      }),
      prisma.crmLead.findMany({
        where: { userId, OR: [{ ownerName: contains }, { businessName: contains }, { phone: contains }, { email: contains }, { streetAddress: contains }] },
        take: 5,
        select: { id: true, ownerName: true, businessName: true, phone: true, email: true },
      }),
      prisma.mlsLead.findMany({
        where: { userId, address: contains },
        take: 5,
        select: { id: true, address: true, status: true },
      }),
    ]);

    const results = [
      ...properties.map(mapPropertyResult),
      ...preforeclosures.map(mapPreForeclosureResult),
      ...crmLeads.map(mapCrmLeadResult),
      ...mlsLeads.map(mapMlsLeadResult),
    ];
    res.json({ results });
  } catch (error) {
    console.error('[SEARCH] Failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
```

- [ ] **Step 6: Write the failing test for notificationFeed.js**

Create `functions/src/lib/notificationFeed.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { mapFollowUpNotification, mapInboxNotification, sortByTimestampDesc } = require('./notificationFeed');

describe('mapFollowUpNotification', () => {
  it('uses the property address and "properties" tab when propertyId is set', () => {
    const result = mapFollowUpNotification({
      id: 'f1', propertyId: 'p1', preforeclosureId: null, date: '2026-09-11T00:00:00.000Z',
      property: { propertyAddress: '123 Main St' }, preForeclosure: null, drivingLead: null,
    });
    expect(result).toEqual({ type: 'followup', id: 'f1', message: 'Follow-up due: 123 Main St', timestamp: '2026-09-11T00:00:00.000Z', tab: 'properties' });
  });

  it('uses the pre-foreclosure address and "preforeclosure" tab when preforeclosureId is set', () => {
    const result = mapFollowUpNotification({
      id: 'f2', propertyId: null, preforeclosureId: 'pf1', date: '2026-09-11T00:00:00.000Z',
      property: null, preForeclosure: { address: '456 Oak Ave' }, drivingLead: null,
    });
    expect(result).toEqual({ type: 'followup', id: 'f2', message: 'Follow-up due: 456 Oak Ave', timestamp: '2026-09-11T00:00:00.000Z', tab: 'preforeclosure' });
  });

  it('falls back to the driving lead rawAddress and "driving" tab otherwise', () => {
    const result = mapFollowUpNotification({
      id: 'f3', propertyId: null, preforeclosureId: null, date: '2026-09-11T00:00:00.000Z',
      property: null, preForeclosure: null, drivingLead: { rawAddress: '789 Elm St' },
    });
    expect(result).toEqual({ type: 'followup', id: 'f3', message: 'Follow-up due: 789 Elm St', timestamp: '2026-09-11T00:00:00.000Z', tab: 'driving' });
  });

  it('falls back to a generic message when no relation resolved to an address', () => {
    const result = mapFollowUpNotification({
      id: 'f4', propertyId: null, preforeclosureId: null, date: '2026-09-11T00:00:00.000Z',
      property: null, preForeclosure: null, drivingLead: null,
    });
    expect(result.message).toBe('Follow-up due: a lead');
  });
});

describe('mapInboxNotification', () => {
  it('includes the submitter name', () => {
    expect(mapInboxNotification({ id: 's1', name: 'Pat Smith', createdAt: '2026-09-10T00:00:00.000Z' })).toEqual({
      type: 'inbox', id: 's1', message: 'New inquiry from Pat Smith', timestamp: '2026-09-10T00:00:00.000Z', tab: 'inbox',
    });
  });

  it('falls back to a generic label when name is blank', () => {
    expect(mapInboxNotification({ id: 's2', name: '', createdAt: '2026-09-10T00:00:00.000Z' }).message).toBe('New inquiry from a visitor');
  });
});

describe('sortByTimestampDesc', () => {
  it('orders newest first', () => {
    const items = [
      { id: 'a', timestamp: '2026-09-10T00:00:00.000Z' },
      { id: 'b', timestamp: '2026-09-11T00:00:00.000Z' },
      { id: 'c', timestamp: '2026-09-09T00:00:00.000Z' },
    ];
    expect(sortByTimestampDesc(items).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate its input array', () => {
    const items = [{ id: 'a', timestamp: '2026-09-10T00:00:00.000Z' }, { id: 'b', timestamp: '2026-09-11T00:00:00.000Z' }];
    const original = [...items];
    sortByTimestampDesc(items);
    expect(items).toEqual(original);
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `npx vitest run functions/src/lib/notificationFeed.test.js`
Expected: FAIL — `./notificationFeed` module not found.

- [ ] **Step 8: Implement notificationFeed.js**

Create `functions/src/lib/notificationFeed.js`:

```js
function mapFollowUpNotification(f) {
  const address = f.property?.propertyAddress || f.preForeclosure?.address || f.drivingLead?.rawAddress || 'a lead';
  const tab = f.propertyId ? 'properties' : f.preforeclosureId ? 'preforeclosure' : 'driving';
  return { type: 'followup', id: f.id, message: `Follow-up due: ${address}`, timestamp: f.date, tab };
}

function mapInboxNotification(s) {
  return { type: 'inbox', id: s.id, message: `New inquiry from ${s.name || 'a visitor'}`, timestamp: s.createdAt, tab: 'inbox' };
}

function sortByTimestampDesc(items) {
  return [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

module.exports = { mapFollowUpNotification, mapInboxNotification, sortByTimestampDesc };
```

- [ ] **Step 9: Run it to confirm it passes**

Run: `npx vitest run functions/src/lib/notificationFeed.test.js`
Expected: PASS (7 tests).

- [ ] **Step 10: Create the notifications route**

Create `functions/src/routes/notifications.js`:

```js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { mapFollowUpNotification, mapInboxNotification, sortByTimestampDesc } = require('../lib/notificationFeed');

router.use(authenticateToken);

// Unscoped by userId, matching FollowUp/PublicSubmission's existing
// team-wide visibility elsewhere in the app (see functions/src/routes/followups.js,
// which also doesn't filter by user) — this is not new sharing, it mirrors
// what's already true.
router.get('/', async (req, res) => {
  try {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [dueFollowUps, newSubmissions] = await Promise.all([
      prisma.followUp.findMany({
        where: { completed: false, date: { lte: endOfToday } },
        orderBy: { date: 'asc' },
        take: 5,
        include: {
          property: { select: { propertyAddress: true } },
          preForeclosure: { select: { address: true } },
          drivingLead: { select: { rawAddress: true } },
        },
      }),
      prisma.publicSubmission.findMany({
        where: { status: 'new' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const notifications = sortByTimestampDesc([
      ...dueFollowUps.map(mapFollowUpNotification),
      ...newSubmissions.map(mapInboxNotification),
    ]).slice(0, 10);

    res.json({ notifications, count: dueFollowUps.length + newSubmissions.length });
  } catch (error) {
    console.error('[NOTIFICATIONS] Failed:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

module.exports = router;
```

- [ ] **Step 11: Mount both routes**

In `functions/src/index.js`, find this line (near the other route imports, currently the last one):

```js
const settingsRoutes = require('./routes/settings');
```

Add immediately after it:

```js
const searchRoutes = require('./routes/search');
const notificationsRoutes = require('./routes/notifications');
```

Find this line (near the other `app.use('/api/...')` calls, currently the last one):

```js
app.use('/api/settings', settingsRoutes);
```

Add immediately after it:

```js
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationsRoutes);
```

- [ ] **Step 12: Syntax-check the new/modified backend files**

Run (from `functions/`):
```bash
node --check src/routes/search.js && node --check src/routes/notifications.js && node --check src/index.js
```
Expected: no output (all OK) for each.

- [ ] **Step 13: Full check and commit**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run && npx tsc --noEmit`
Expected: all tests pass (new ones included), typecheck clean (this task
touches no frontend files, but run the full check anyway per convention).

```bash
git add functions/src/lib/searchResults.js functions/src/lib/searchResults.test.js functions/src/routes/search.js functions/src/lib/notificationFeed.js functions/src/lib/notificationFeed.test.js functions/src/routes/notifications.js functions/src/index.js
git commit -m "Add /api/search and /api/notifications endpoints"
```

---

### Task 3: Frontend search/notifications plumbing, seeded into existing views

**Files:**
- Create: `src/lib/pendingSearch.ts`
- Create: `src/lib/pendingSearch.test.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/components/properties/PropertiesView.tsx:363`
- Modify: `src/components/preforeclosure/PreForeclosureView.tsx:245`
- Modify: `src/components/mls/MlsLeadsView.tsx:177`
- Modify: `src/components/crm/CrmView.tsx`

**Interfaces:**
- Consumes: `GET /api/search` and `GET /api/notifications` response shapes from Task 2.
- Produces: `setPendingSearch(tab: string, query: string): void`, `consumePendingSearch(tab: string): string | null` (from `pendingSearch.ts`) — Task 4 (GlobalSearchDialog) calls `setPendingSearch`; this task's own view edits call `consumePendingSearch`. Produces: `searchAll(query: string): Promise<SearchResult[]>` and `getNotifications(): Promise<{ notifications: Notification[]; count: number }>` (from `api.ts`) — Task 4 and Task 6 (TopBar) call these.

- [ ] **Step 1: Write the failing test for pendingSearch.ts**

Create `src/lib/pendingSearch.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setPendingSearch, consumePendingSearch } from './pendingSearch'

describe('pendingSearch', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns null when nothing was set for that tab', () => {
    expect(consumePendingSearch('properties')).toBeNull()
  })

  it('returns the set value on first consume', () => {
    setPendingSearch('properties', '123 Main St')
    expect(consumePendingSearch('properties')).toBe('123 Main St')
  })

  it('clears the value after consuming it once', () => {
    setPendingSearch('mls', '456 Oak Ave')
    consumePendingSearch('mls')
    expect(consumePendingSearch('mls')).toBeNull()
  })

  it('keeps different tabs independent', () => {
    setPendingSearch('properties', 'A')
    setPendingSearch('crm', 'B')
    expect(consumePendingSearch('crm')).toBe('B')
    expect(consumePendingSearch('properties')).toBe('A')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run src/lib/pendingSearch.test.ts`
Expected: FAIL — `./pendingSearch` module not found.

- [ ] **Step 3: Implement pendingSearch.ts**

Create `src/lib/pendingSearch.ts`:

```ts
const KEY_PREFIX = 'pendingSearch:'

export function setPendingSearch(tab: string, query: string): void {
  sessionStorage.setItem(`${KEY_PREFIX}${tab}`, query)
}

/** Reads and clears in one call — a pending search is consumed at most once. */
export function consumePendingSearch(tab: string): string | null {
  const key = `${KEY_PREFIX}${tab}`
  const value = sessionStorage.getItem(key)
  if (value !== null) sessionStorage.removeItem(key)
  return value
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/pendingSearch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add searchAll and getNotifications to api.ts**

In `src/lib/api.ts`, find this line:

```ts
/**
 * Get all pre-foreclosure records
 * @param filters Optional filters for address, city, zip
 */
```

Insert immediately before it:

```ts
export interface SearchResult {
  type: 'property' | 'preforeclosure' | 'crmLead' | 'mlsLead'
  id: string
  label: string
  sublabel: string
  tab: string
}

export async function searchAll(query: string): Promise<SearchResult[]> {
  const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) throw new Error('Search failed')
  const data = await response.json()
  return data.results
}

export interface Notification {
  type: 'followup' | 'inbox'
  id: string
  message: string
  timestamp: string
  tab: string
}

export async function getNotifications(): Promise<{ notifications: Notification[]; count: number }> {
  const response = await fetch(`${API_BASE_URL}/api/notifications`, { headers: getAuthHeaders() })
  if (!response.ok) throw new Error('Failed to load notifications')
  return response.json()
}

/**
 * Get all pre-foreclosure records
 * @param filters Optional filters for address, city, zip
 */
```

(This inserts the two new exports right before the existing
`getPreForeclosures` doc comment — `api.ts` has no dedicated test file, matching
its existing convention of untested thin fetch wrappers; do not add one.)

- [ ] **Step 6: Seed PropertiesView's search state from a pending search**

In `src/components/properties/PropertiesView.tsx`, line 363, change:

```tsx
  const [searchQuery, setSearchQuery] = useState('');
```

to:

```tsx
  const [searchQuery, setSearchQuery] = useState(() => consumePendingSearch('properties') ?? '');
```

Add the import near the top of the file, alongside the other `@/lib/...` imports:

```tsx
import { consumePendingSearch } from '@/lib/pendingSearch';
```

- [ ] **Step 7: Seed PreForeclosureView's search state**

In `src/components/preforeclosure/PreForeclosureView.tsx`, line 245, change:

```tsx
  const [searchQuery, setSearchQuery] = useState('');
```

to:

```tsx
  const [searchQuery, setSearchQuery] = useState(() => consumePendingSearch('preforeclosure') ?? '');
```

Add the import near the top of the file, alongside the other `@/lib/...` imports:

```tsx
import { consumePendingSearch } from '@/lib/pendingSearch';
```

- [ ] **Step 8: Seed MlsLeadsView's search state**

In `src/components/mls/MlsLeadsView.tsx`, line 177, change:

```tsx
  const [search, setSearch] = useState('');
```

to:

```tsx
  const [search, setSearch] = useState(() => consumePendingSearch('mls') ?? '');
```

Add the import near the top of the file, alongside the other `@/lib/...` imports:

```tsx
import { consumePendingSearch } from '@/lib/pendingSearch';
```

- [ ] **Step 9: Seed CRM's search store**

`CrmView.tsx`'s first line already reads
`import { useEffect, useState } from 'react';` — `useEffect` is already
imported, do not add a second `react` import line. Add these two new
imports below it, alongside the file's other imports:

```tsx
import { useSearchStore } from '@/crm/lib/searchStore';
import { consumePendingSearch } from '@/lib/pendingSearch';
```

Inside the `CrmView` function body, add a new effect that runs once on mount,
placed near the existing `hydrate` effect:

```tsx
  useEffect(() => {
    const pending = consumePendingSearch('crm');
    if (pending) useSearchStore.getState().setQuery(pending);
  }, []);
```

- [ ] **Step 10: Full check**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run && npx tsc --noEmit`
Expected: all tests pass, typecheck clean. (No new component-level tests are
added in steps 6-9 — these are one-line state-initializer changes to already
-covered-or-uncovered views; the `pendingSearch.test.ts` from steps 1-4
already proves the underlying primitive is correct.)

- [ ] **Step 11: Commit**

```bash
git add src/lib/pendingSearch.ts src/lib/pendingSearch.test.ts src/lib/api.ts src/components/properties/PropertiesView.tsx src/components/preforeclosure/PreForeclosureView.tsx src/components/mls/MlsLeadsView.tsx src/components/crm/CrmView.tsx
git commit -m "Wire pendingSearch and search/notifications API clients into existing views"
```

---

### Task 4: GlobalSearchDialog

**Files:**
- Create: `src/components/layout/GlobalSearchDialog.tsx`
- Create: `src/components/layout/GlobalSearchDialog.test.tsx`

**Interfaces:**
- Consumes: `searchAll(query: string): Promise<SearchResult[]>` and `SearchResult` type from `@/lib/api` (Task 3); `setPendingSearch(tab, query)` from `@/lib/pendingSearch` (Task 3); `CommandDialog`/`CommandInput`/`CommandList`/`CommandEmpty`/`CommandGroup`/`CommandItem` from `@/components/ui/command` (pre-existing, unchanged).
- Produces: `GlobalSearchDialog({ open: boolean; onOpenChange: (open: boolean) => void; onNavigate: (tab: TabType) => void })` — a default export is NOT used; export it as a named export `GlobalSearchDialog`, matching this codebase's convention for multi-export layout files (see `Sidebar`/`TopBar` in later tasks, which follow the same pattern). Task 6 (AppShell) renders this component and supplies `onNavigate`.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/GlobalSearchDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlobalSearchDialog } from './GlobalSearchDialog'
import * as api from '@/lib/api'
import * as pendingSearch from '@/lib/pendingSearch'

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not search until at least 2 characters are typed', async () => {
    const searchAllSpy = vi.spyOn(api, 'searchAll').mockResolvedValue([])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={() => {}} onNavigate={() => {}} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'a')
    vi.advanceTimersByTime(500)
    expect(searchAllSpy).not.toHaveBeenCalled()
  })

  it('searches (debounced) once 2+ characters are typed, and groups results by type', async () => {
    vi.spyOn(api, 'searchAll').mockResolvedValue([
      { type: 'property', id: 'p1', label: '123 Main St', sublabel: 'Jane Doe', tab: 'properties' },
      { type: 'crmLead', id: 'c1', label: 'Sam Lee', sublabel: '2105551212', tab: 'crm' },
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={() => {}} onNavigate={() => {}} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'main')
    vi.advanceTimersByTime(400)

    await waitFor(() => expect(screen.getByText('123 Main St')).toBeTruthy())
    expect(screen.getByText('Sam Lee')).toBeTruthy()
    expect(screen.getByText('Properties')).toBeTruthy()
    expect(screen.getByText('Contacts')).toBeTruthy()
  })

  it('selecting a result sets a pending search, navigates to its tab, and closes', async () => {
    vi.spyOn(api, 'searchAll').mockResolvedValue([
      { type: 'property', id: 'p1', label: '123 Main St', sublabel: 'Jane Doe', tab: 'properties' },
    ])
    const setPendingSearchSpy = vi.spyOn(pendingSearch, 'setPendingSearch')
    const onNavigate = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} onNavigate={onNavigate} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'main')
    vi.advanceTimersByTime(400)
    await waitFor(() => expect(screen.getByText('123 Main St')).toBeTruthy())

    await user.click(screen.getByText('123 Main St'))

    expect(setPendingSearchSpy).toHaveBeenCalledWith('properties', '123 Main St')
    expect(onNavigate).toHaveBeenCalledWith('properties')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows an inline error message and keeps the dialog open when the search call fails', async () => {
    vi.spyOn(api, 'searchAll').mockRejectedValue(new Error('Search failed'))
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} onNavigate={() => {}} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'main')
    vi.advanceTimersByTime(400)

    await waitFor(() => expect(screen.getByText(/search failed/i)).toBeTruthy())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run src/components/layout/GlobalSearchDialog.test.tsx`
Expected: FAIL — `./GlobalSearchDialog` module not found.

- [ ] **Step 3: Implement GlobalSearchDialog**

Create `src/components/layout/GlobalSearchDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { searchAll, type SearchResult } from '@/lib/api'
import { setPendingSearch } from '@/lib/pendingSearch'
import type { TabType } from './navItems'

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  property: 'Properties',
  preforeclosure: 'Pre-Foreclosure',
  crmLead: 'Contacts',
  mlsLead: 'MLS Leads',
}

const GROUP_ORDER: SearchResult['type'][] = ['property', 'preforeclosure', 'crmLead', 'mlsLead']

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (tab: TabType) => void
}

export function GlobalSearchDialog({ open, onOpenChange, onNavigate }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }
    const timer = setTimeout(() => {
      searchAll(query)
        .then((r) => {
          setResults(r)
          setError(null)
        })
        .catch(() => setError('Search failed. Try again.'))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setPendingSearch(result.tab, result.label)
    onNavigate(result.tab as TabType)
    onOpenChange(false)
  }

  const grouped = GROUP_ORDER
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search contacts, addresses, opportunities, or anything..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {error && <p className="px-4 py-3 text-sm text-destructive">{error}</p>}
        {!error && query.trim().length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {!error && grouped.map((group) => (
          <CommandGroup key={group.type} heading={GROUP_LABELS[group.type]}>
            {group.items.map((result) => (
              <CommandItem key={`${result.type}-${result.id}`} onSelect={() => handleSelect(result)}>
                <div className="flex flex-col">
                  <span>{result.label}</span>
                  {result.sublabel && <span className="text-xs text-muted-foreground">{result.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/components/layout/GlobalSearchDialog.test.tsx`
Expected: PASS (4 tests). If `userEvent.type` with fake timers proves flaky in
this environment, an acceptable fallback is switching the affected test(s)
from `user.type` to `fireEvent.change` on the `CommandInput` element plus
`vi.advanceTimersByTime` — keep the assertions identical, only change how
text entry is simulated.

- [ ] **Step 5: Full check and commit**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run && npx tsc --noEmit`
Expected: all tests pass, typecheck clean.

```bash
git add src/components/layout/GlobalSearchDialog.tsx src/components/layout/GlobalSearchDialog.test.tsx
git commit -m "Add GlobalSearchDialog (cmdk-based cross-domain search UI)"
```

---

### Task 5: Sidebar (replaces NavRail)

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Sidebar.test.tsx`
- Delete: `src/components/layout/NavRail.tsx`
- Delete: `src/components/layout/NavRail.test.tsx`

**Interfaces:**
- Consumes: `tabs`, `getVisibleTabs`, `isPublicSiteVisible`, `externalNavItem`, `type TabType` from `./navItems` (unchanged); `useAuth` from `@/contexts/AuthContext` (unchanged, already exposes `user.role`); `ManagerViewDialog` from `./ManagerViewDialog` (unchanged); `AvatarInitials` from `@/components/ui/avatar-initials` (Task 1); shadcn `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuLabel`/`DropdownMenuSeparator`/`DropdownMenuTrigger` from `@/components/ui/dropdown-menu` (unchanged, same ones `Header.tsx` used).
- Produces: `Sidebar({ activeTab: TabType; onTabChange: (tab: TabType) => void; hiddenTabIds: Set<string>; onHiddenTabsSaved: (ids: Set<string>) => void })`. Task 6 (AppShell) renders this.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/Sidebar.test.tsx` (migrates every assertion
from the deleted `NavRail.test.tsx`, plus two new ones for the ADMIN-only
Settings item):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'
import { tabs, getVisibleTabs } from './navItems'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', username: 'raul', role: 'OPERATOR' } })),
}))

import { useAuth } from '@/contexts/AuthContext'

const noop = () => {}
const defaultProps = {
  activeTab: 'properties' as const,
  onTabChange: noop,
  hiddenTabIds: new Set<string>(),
  onHiddenTabsSaved: noop,
}

describe('Sidebar', () => {
  it('renders every tab when nothing is hidden', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Eviction List/ })).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(tabs.length)
  })

  it('hides tabs named in hiddenTabIds', () => {
    render(<Sidebar {...defaultProps} hiddenTabIds={new Set(['dashboard'])} />)
    expect(screen.queryByRole('button', { name: /Dashboard/ })).toBeNull()
  })

  it('marks only the active tab with aria-current', () => {
    render(<Sidebar {...defaultProps} activeTab="properties" />)
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain('Properties')
  })

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn()
    render(<Sidebar {...defaultProps} activeTab="dashboard" onTabChange={onTabChange} />)
    screen.getByRole('button', { name: /Calendar/ }).click()
    expect(onTabChange).toHaveBeenCalledWith('calendar')
  })

  it('renders the Public Website link by default, opening in a new tab', () => {
    render(<Sidebar {...defaultProps} />)
    const link = screen.getByRole('link', { name: /Public Website/ })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('hides the Public Website link when publicSite is in hiddenTabIds', () => {
    render(<Sidebar {...defaultProps} hiddenTabIds={new Set(['publicSite'])} />)
    expect(screen.queryByRole('link', { name: /Public Website/ })).toBeNull()
  })

  it('does not render a Settings item for a non-ADMIN user', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /Settings/ })).toBeNull()
  })

  it('renders a Settings item for an ADMIN user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' } } as any)
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Settings/ })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run src/components/layout/Sidebar.test.tsx`
Expected: FAIL — `./Sidebar` module not found.

- [ ] **Step 3: Implement Sidebar**

Create `src/components/layout/Sidebar.tsx`:

```tsx
import { useState } from 'react'
import { Building2, ChevronDown, LogOut, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { AvatarInitials } from '@/components/ui/avatar-initials'
import { ManagerViewDialog } from './ManagerViewDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { externalNavItem, getVisibleTabs, isPublicSiteVisible, type TabType } from './navItems'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Manager',
  OPERATOR: 'Team Member',
  VIEWER: 'Viewer',
}

const itemClasses = (isActive: boolean) =>
  cn(
    'flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    isActive ? 'text-white' : 'text-white/70 hover:text-white'
  )

interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onHiddenTabsSaved: (ids: Set<string>) => void
}

export function Sidebar({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved }: SidebarProps) {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [isManagerViewOpen, setIsManagerViewOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const visibleTabs = getVisibleTabs(hiddenTabIds)

  return (
    <nav
      aria-label="Sections"
      className="hidden md:flex w-64 shrink-0 flex-col py-4"
      style={{ backgroundColor: 'hsl(var(--navy))' }}
    >
      <div className="mb-6 flex items-center gap-3 px-4">
        <Building2 className="h-7 w-7 text-white" />
        <div>
          <p className="text-sm font-semibold leading-tight text-white">Bexar CRE Acquisition CRM</p>
          <p className="text-xs leading-tight text-white/60">San Antonio, TX</p>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={itemClasses(isActive)}
                style={isActive ? { backgroundColor: 'hsl(var(--navy-mid))' } : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {tab.label}
              </button>
            </li>
          )
        })}
        {isPublicSiteVisible(hiddenTabIds) && (
          <li>
            <a
              href={externalNavItem.href}
              target="_blank"
              rel="noopener noreferrer"
              className={itemClasses(false)}
            >
              <externalNavItem.icon className="h-[18px] w-[18px] shrink-0" />
              {externalNavItem.label}
            </a>
          </li>
        )}
        {isAdmin && (
          <li>
            <button type="button" onClick={() => setIsManagerViewOpen(true)} className={itemClasses(false)}>
              <Settings className="h-[18px] w-[18px] shrink-0" />
              Settings
            </button>
          </li>
        )}
      </ul>

      {user && (
        <div className="mt-auto px-2 pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-white/90 hover:bg-[hsl(var(--navy-mid))]"
              >
                <AvatarInitials name={user.username} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.username}</span>
                  <span className="block truncate text-xs text-white/60">{ROLE_LABELS[user.role ?? ''] ?? 'Team Member'}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.username}</p>
                  {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isAdmin && (
        <ManagerViewDialog
          isOpen={isManagerViewOpen}
          onClose={() => setIsManagerViewOpen(false)}
          onHiddenTabsSaved={onHiddenTabsSaved}
        />
      )}
    </nav>
  )
}
```

Note: unlike the old `NavRail`, nav items here render icon + full `label`
(not `shortLabel`) side by side — that's the point of this task, matching
the mockup. `shortLabel` remains defined on `tabs` in `navItems.ts` (unused
by `Sidebar`, still fine to leave — later phases' mobile sheet in Task 6
also uses full `label`, not `shortLabel`).

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Delete NavRail**

```bash
git rm src/components/layout/NavRail.tsx src/components/layout/NavRail.test.tsx
```

(`Index.tsx` still imports `NavRail` at this point — that import is removed
in Task 6, which is the task that actually stops using it. Leaving the
import broken between Task 5 and Task 6 within the same working tree is
fine since Task 6 is the very next task and this plan is executed
sequentially, but do NOT run `npx tsc --noEmit` as a gate at the end of
*this* task if it fails solely because of the now-dangling `NavRail` import
in `Index.tsx` — confirm any failure is exactly that one missing-module
error before treating the task as done, and note it in the task report
rather than trying to fix `Index.tsx` here.)

- [ ] **Step 6: Full check and commit**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run`
Expected: all tests pass except that `Index.tsx` having no test file means
this won't surface as a test failure at all — vitest doesn't typecheck.
Run `npx tsc --noEmit` too and confirm its only new error (if any) is the
dangling `NavRail` import in `src/pages/Index.tsx`, per Step 5's note.

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx
git commit -m "Add Sidebar (replaces NavRail): full-label nav, branding, ADMIN Settings item, user footer"
```

---

### Task 6: TopBar, AppShell, and wiring Index.tsx (replaces Header)

**Files:**
- Create: `src/components/layout/TopBar.tsx`
- Create: `src/components/layout/TopBar.test.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Delete: `src/components/layout/Header.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `GlobalSearchDialog` (Task 4); `getNotifications`, `type Notification` from `@/lib/api` (Task 3); `Sidebar` (Task 5); `tabs`, `getVisibleTabs`, `type TabType` from `./navItems` (unchanged); `ManagerViewDialog` (unchanged); shadcn `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetTrigger` (unchanged, same ones `Header.tsx` used).
- Produces: `TopBar({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved, onRefresh, isRefreshing, onOpenSearch })`. `AppShell({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved, onRefresh, isRefreshing, children })` — `Index.tsx` renders this in place of its current `NavRail`+`Header`+`main` block.

- [ ] **Step 1: Write the failing test for TopBar**

Create `src/components/layout/TopBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import * as api from '@/lib/api'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', username: 'raul', role: 'OPERATOR' }, logout: vi.fn() })),
}))

const noop = () => {}
const defaultProps = {
  activeTab: 'properties' as const,
  onTabChange: noop,
  hiddenTabIds: new Set<string>(),
  onHiddenTabsSaved: noop,
  onRefresh: noop,
  isRefreshing: false,
  onOpenSearch: noop,
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({ notifications: [], count: 0 })
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders a search trigger with the mockup placeholder text', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByPlaceholderText(/search contacts, addresses, opportunities/i)).toBeTruthy()
  })

  it('clicking the search trigger calls onOpenSearch', async () => {
    const onOpenSearch = vi.fn()
    render(<TopBar {...defaultProps} onOpenSearch={onOpenSearch} />)
    screen.getByPlaceholderText(/search contacts, addresses, opportunities/i).click()
    expect(onOpenSearch).toHaveBeenCalled()
  })

  it('shows a notification badge when count > 0', async () => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({
      notifications: [{ type: 'followup', id: 'f1', message: 'Follow-up due: 123 Main St', timestamp: '2026-09-11T00:00:00.000Z', tab: 'properties' }],
      count: 1,
    })
    render(<TopBar {...defaultProps} />)
    await waitFor(() => expect(screen.getByTestId('notification-badge')).toBeTruthy())
  })

  it('does not show a notification badge when count is 0', async () => {
    render(<TopBar {...defaultProps} />)
    await waitFor(() => expect(api.getNotifications).toHaveBeenCalled())
    expect(screen.queryByTestId('notification-badge')).toBeNull()
  })

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(<TopBar {...defaultProps} onRefresh={onRefresh} />)
    screen.getByRole('button', { name: /refresh/i }).click()
    expect(onRefresh).toHaveBeenCalled()
  })

  it('mobile menu button opens a sheet listing visible tabs', async () => {
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Calendar/ })).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run src/components/layout/TopBar.test.tsx`
Expected: FAIL — `./TopBar` module not found.

- [ ] **Step 3: Implement TopBar**

Create `src/components/layout/TopBar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Bell, FileText, LogOut, Menu, RefreshCw, Search, Settings, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { getNotifications, type Notification } from '@/lib/api'
import { getVisibleTabs, type TabType } from './navItems'
import { ManagerViewDialog } from './ManagerViewDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const POLL_INTERVAL_MS = 2 * 60 * 1000

interface TopBarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onHiddenTabsSaved: (ids: Set<string>) => void
  onRefresh: () => void
  isRefreshing: boolean
  onOpenSearch: () => void
}

export function TopBar({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved, onRefresh, isRefreshing, onOpenSearch }: TopBarProps) {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [count, setCount] = useState(0)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isManagerViewOpen, setIsManagerViewOpen] = useState(false)

  const loadNotifications = () => {
    getNotifications()
      .then((data) => {
        setNotifications(data.notifications)
        setCount(data.count)
      })
      .catch(() => {
        // Leave the last-known badge/list in place on a transient failure
        // rather than flashing it to empty (see this phase's spec).
      })
  }

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      setIsMobileMenuOpen(false)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const visibleTabs = getVisibleTabs(hiddenTabIds)

  return (
    <header className="border-b bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex flex-1 max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/50"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate" data-placeholder>
            Search contacts, addresses, opportunities, or anything...
          </span>
          <kbd className="hidden sm:inline rounded border bg-muted px-1.5 py-0.5 text-xs">⌘K</kbd>
        </button>
        {/* A visually-hidden real input carries the placeholder text so
            screen readers and text-based test queries (getByPlaceholderText)
            can find this trigger the same way they would a real search box. */}
        <input readOnly placeholder="Search contacts, addresses, opportunities, or anything..." onClick={onOpenSearch} className="sr-only" tabIndex={-1} />

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Popover open={isNotifOpen} onOpenChange={(open) => { setIsNotifOpen(open); if (open) loadNotifications() }}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {count > 0 && (
                  <span data-testid="notification-badge" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              {notifications.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>
              ) : (
                <ul className="space-y-1">
                  {notifications.map((n) => (
                    <li key={`${n.type}-${n.id}`}>
                      <button
                        type="button"
                        onClick={() => { onTabChange(n.tab as TabType); setIsNotifOpen(false) }}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        {n.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>

          {/* Mobile: hamburger opens tab nav + account actions. Desktop nav
              lives in Sidebar; desktop account menu lives in Sidebar's
              footer — this Sheet is mobile-only. */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}>
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 mt-6">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <Button
                      key={tab.id}
                      variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                      className="justify-start mobile-touch-target"
                      onClick={() => { setIsMobileMenuOpen(false); onTabChange(tab.id) }}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {tab.label}
                    </Button>
                  )
                })}

                <div className="my-2 border-t" />

                <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('upload') }}>
                  <Upload className="h-5 w-5 mr-3" />
                  Upload
                </Button>
                <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('files') }}>
                  <FileText className="h-5 w-5 mr-3" />
                  Files
                </Button>
                {isAdmin && (
                  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); setIsManagerViewOpen(true) }}>
                    <Settings className="h-5 w-5 mr-3" />
                    Manager Settings
                  </Button>
                )}
                <Button variant="ghost" className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10 mobile-touch-target" onClick={handleLogout}>
                  <LogOut className="h-5 w-5 mr-3" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {isAdmin && (
        <ManagerViewDialog
          isOpen={isManagerViewOpen}
          onClose={() => setIsManagerViewOpen(false)}
          onHiddenTabsSaved={onHiddenTabsSaved}
        />
      )}
    </header>
  )
}
```

`Popover`/`PopoverTrigger`/`PopoverContent` are already used elsewhere in
this codebase (see `SendContactsToTeammate.tsx`) — confirm
`src/components/ui/popover.tsx` exists before writing this file; it does
(same shadcn set as `dialog.tsx`/`command.tsx`).

Note the deliberate `getByPlaceholderText`-friendly `sr-only` input: the
visible search trigger is a `<button>` (not a real `<input>`, since
clicking it opens a dialog rather than accepting typed text itself), but
Task 6's own test (and the spec's UX description) both refer to it via
placeholder text the way a real search input would be found. The
visually-hidden real `<input readOnly>` makes `getByPlaceholderText` work
identically for both — this is the only place in this component that
input exists; it is not rendered twice on screen.

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/components/layout/TopBar.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement AppShell**

Create `src/components/layout/AppShell.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearchDialog } from './GlobalSearchDialog'
import type { TabType } from './navItems'

interface AppShellProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onHiddenTabsSaved: (ids: Set<string>) => void
  onRefresh: () => void
  isRefreshing: boolean
  children: React.ReactNode
}

export function AppShell({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved, onRefresh, isRefreshing, children }: AppShellProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} hiddenTabIds={hiddenTabIds} onHiddenTabsSaved={onHiddenTabsSaved} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          hiddenTabIds={hiddenTabIds}
          onHiddenTabsSaved={onHiddenTabsSaved}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
        <div className="flex-1 overflow-y-auto">
          <main className="container mx-auto animate-fade-in overflow-x-hidden">{children}</main>
        </div>
      </div>
      <GlobalSearchDialog open={isSearchOpen} onOpenChange={setIsSearchOpen} onNavigate={onTabChange} />
    </div>
  )
}
```

- [ ] **Step 6: Delete Header.tsx**

```bash
git rm src/components/layout/Header.tsx
```

(`Header.test.tsx` does not exist — confirmed earlier in this project's
research; nothing else to remove.)

- [ ] **Step 7: Wire Index.tsx to use AppShell**

In `src/pages/Index.tsx`, change the imports at the top: remove

```tsx
import { Header } from '@/components/layout/Header';
import { NavRail } from '@/components/layout/NavRail';
```

and add, in the same place:

```tsx
import { AppShell } from '@/components/layout/AppShell';
```

Then replace the final `return` block — currently:

```tsx
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <NavRail activeTab={activeTab} onTabChange={setActiveTab} hiddenTabIds={hiddenTabIds} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onTabChange={setActiveTab}
          onHiddenTabsSaved={setHiddenTabIds}
        />
        <div className="flex-1 overflow-y-auto">
          <main className="container mx-auto animate-fade-in overflow-x-hidden">
            {renderContent()}
          </main>
        </div>
      </div>
      <PhoneSearchModal
        isOpen={isPhoneSearchOpen}
        onClose={() => setIsPhoneSearchOpen(false)}
        onSelectProperty={(p) => {
          setPhoneSearchResult(p);
          setIsPhoneSearchOpen(false);
        }}
      />
      <PropertyDetailsModal
        property={phoneSearchResult}
        isOpen={!!phoneSearchResult}
        onClose={() => setPhoneSearchResult(null)}
      />
    </div>
  );
```

with:

```tsx
  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hiddenTabIds={hiddenTabIds}
        onHiddenTabsSaved={setHiddenTabIds}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      >
        {renderContent()}
      </AppShell>
      <PhoneSearchModal
        isOpen={isPhoneSearchOpen}
        onClose={() => setIsPhoneSearchOpen(false)}
        onSelectProperty={(p) => {
          setPhoneSearchResult(p);
          setIsPhoneSearchOpen(false);
        }}
      />
      <PropertyDetailsModal
        property={phoneSearchResult}
        isOpen={!!phoneSearchResult}
        onClose={() => setPhoneSearchResult(null)}
      />
    </>
  );
```

(`PhoneSearchModal`/`PropertyDetailsModal` move outside `AppShell` but stay
siblings of it in a fragment — they were never inside the old `<div
className="flex h-dvh...">` wrapper's scrolling area either, just inside the
same outer container; a fragment preserves that.)

Every other part of `Index.tsx` (the `resetToken`/`isLoading`/
`!isAuthenticated`/`isCrmVisible` early returns, `renderContent`,
`getInitialTab`, all the `useEffect`s) is unchanged.

- [ ] **Step 8: Full check**

Run: `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass, typecheck clean, production build succeeds. This
is the first point since Task 5 where `Index.tsx`'s `NavRail` import is
actually gone, so any dangling-import error noted as acceptable in Task 5
must be resolved by now.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/TopBar.tsx src/components/layout/TopBar.test.tsx src/components/layout/AppShell.tsx src/pages/Index.tsx
git commit -m "Add TopBar and AppShell (replaces Header), wire Index.tsx to the new shell"
```

---

## Final Integration and Deploy

After Task 6's final review passes (per subagent-driven-development's own
broad final-review step), the controller (not a dispatched subagent) does:

1. `cd "C:\Users\Raulm\county-cad-tracker" && npx vitest run && npx tsc --noEmit && npm run build` — one last full check on the fully-merged state.
2. `git push origin main` (frontend deploy trigger).
3. `cd functions && railway up --service county-cad-tracker --ci` (backend deploy — no schema changes, but the two new routes need the running server rebuilt).
4. Verify: `curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://county-cad-tracker-production.up.railway.app/` expect `200`; `curl` `/api/search` and `/api/notifications` without auth, expect `401` (confirms both routes are mounted and gated); watch the GitHub Actions Pages workflow (`gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId'` then `gh run watch <id> --exit-status`) to confirm it goes green.
5. Report back a summary: what shipped, what's now live, and explicitly flag that Dashboard/Contacts/Pre-Foreclosure/MLS/Driving page *content* still looks like it did before (expected — their own phases haven't happened yet), and that the D4$ Kanban board is a separate future phase.
