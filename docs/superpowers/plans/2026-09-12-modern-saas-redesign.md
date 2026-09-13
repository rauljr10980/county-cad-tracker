# Modern SaaS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Bexar CRE Acquisition CRM to match a modern-SaaS mockup — rounded cards, colored status pills, a KPI-card dashboard, a drag-and-drop D4$ pipeline board, and an upcoming-events calendar panel — reusing existing data/hooks throughout.

**Architecture:** Every data source and most of the visual language already exist in the codebase; this plan wires them together rather than inventing new ones. Two duplicated helpers (a pill-badge system, a calendar event feed) get extracted to shared modules first so later tasks can depend on them; one dead component (`StatCard`) gets revived and enhanced instead of building a parallel one.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite, TanStack Query, Zustand, `@hello-pangea/dnd`, `react-big-calendar`, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-12-modern-saas-redesign-design.md`

## Global Constraints

- Do not add `@dnd-kit` anywhere — `@hello-pangea/dnd` is the established DnD library in this codebase (used by the existing Opportunities Kanban board); the new D4$ board must use it too.
- Do not touch `src/components/preforeclosure/PreForeclosureView.tsx` or `WorkflowStageBadge.tsx` — out of scope per the spec (too large/risky).
- Do not move the user profile chip out of `Sidebar.tsx`'s footer — a deliberate prior choice, not part of this redesign.
- `EvictionLeadsView.tsx`'s `stageTone()` function and its return values must not change — `EvictionLeadsView.test.ts` asserts its exact keyword outputs.
- No new backend/API endpoints — every data source used in this plan already exists.
- Every new/modified `.tsx` file follows existing test conventions: Vitest + `@testing-library/react`, `vi.stubGlobal('fetch', ...)` for fetch-based views (see `InboxView.test.tsx`), `vi.mock('@/contexts/AuthContext', ...)` for auth (see `Sidebar.test.tsx`).

---

### Task 1: Design tokens — radius, card elevation, pill-shaped status badges

**Files:**
- Modify: `src/index.css:81`, `src/index.css:132-136`, `src/index.css:154-156`

**Interfaces:**
- Produces: `--radius: 1rem` (consumed by every `rounded-lg`/`rounded-md`/`rounded-sm` Tailwind utility app-wide via `tailwind.config.ts:85-87`'s existing `calc(var(--radius) ...)` mapping — no Tailwind config change needed). `.stat-card` now includes `shadow-sm hover:shadow-md`. `.status-badge` is now `rounded-full` instead of `rounded`.

There is no unit-testable behavior in this task (pure CSS) — verification is the full test suite staying green plus a successful build, confirming nothing else in the app assumed the old flat/hairline look in a way that breaks.

- [ ] **Step 1: Bump the radius token**

In `src/index.css`, change line 81 from:

```css
    --radius: 0.625rem;
```

to:

```css
    --radius: 1rem;
```

Also update the comment directly above it (line 80, `/* Institutional, not rounded. Hairlines carry the structure. */`) to:

```css
    /* Rounded cards and pill-shaped badges — see docs/superpowers/specs/2026-09-12-modern-saas-redesign-design.md */
```

- [ ] **Step 2: Add elevation to `.stat-card`**

In `src/index.css`, find:

```css
  .stat-card {
    @apply bg-card border border-border rounded-lg p-4 transition-all duration-200 hover:border-primary/30;
  }
```

Change to:

```css
  .stat-card {
    @apply bg-card border border-border rounded-lg p-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md;
  }
```

- [ ] **Step 3: Make `.status-badge` pill-shaped**

In `src/index.css`, find:

```css
  .status-badge {
    @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium;
  }
```

Change `rounded` to `rounded-full`:

```css
  .status-badge {
    @apply inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium;
  }
```

- [ ] **Step 4: Run the full test suite and build**

Run: `npm test`
Expected: All existing tests still pass (this task touches no test-covered logic, only CSS).

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "style: round cards and pill-shape status badges for the modern SaaS redesign"
```

---

### Task 2: Extract the shared pill-badge module

**Files:**
- Create: `src/lib/pillBadge.ts`
- Test: `src/lib/pillBadge.test.ts`
- Modify: `src/crm/views/EvictionLeadsView.tsx:66-75`, `src/components/mls/MlsLeadsView.tsx:113-123`, `src/components/mls/SkipTraceQueue.tsx:8`, `src/components/mls/MlsLeadDetails.tsx:8`

**Interfaces:**
- Produces: `pillClass(tone: string): string` and `export type PillTone = 'grey' | 'blue' | 'warn' | 'danger' | 'success'` from `src/lib/pillBadge.ts`.
- Consumed by: Task 11 (Eviction icon actions) and Task 13 (Contacts Active/Inactive badge) both import `pillClass` from this new module.

Eviction's and MLS's `PILL_BASE`/`PILL_TONE_CLASSES`/`pillClass()` are byte-identical except MLS's `PILL_TONE_CLASSES` has one extra entry (`success`) that Eviction's lacks. `EvictionLeadsView.tsx`'s `stageTone()` function (which feeds `pillClass()`) is a **different** function that stays exactly where it is — only the thing consuming its output moves.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pillBadge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pillClass } from './pillBadge';

describe('pillClass', () => {
  it('returns the pill-shaped base classes for every known tone', () => {
    for (const tone of ['grey', 'blue', 'warn', 'danger', 'success']) {
      expect(pillClass(tone)).toContain('rounded-full');
      expect(pillClass(tone)).toContain('inline-flex');
    }
  });

  it('maps each tone to its own background/text classes', () => {
    expect(pillClass('grey')).toBe('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground');
    expect(pillClass('blue')).toContain('bg-primary/15 text-primary');
    expect(pillClass('warn')).toContain('bg-warning/15 text-warning');
    expect(pillClass('danger')).toContain('bg-destructive/15 text-destructive');
    expect(pillClass('success')).toContain('bg-success/15 text-success');
  });

  it('falls back to the grey tone for an unrecognized or empty tone', () => {
    expect(pillClass('')).toBe(pillClass('grey'));
    expect(pillClass('nonsense')).toBe(pillClass('grey'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pillBadge.test.ts`
Expected: FAIL — `Cannot find module './pillBadge'`

- [ ] **Step 3: Create the shared module**

Create `src/lib/pillBadge.ts`:

```ts
// Shared pill-badge styling for CRM tables (Eviction Leads, MLS Leads,
// Contacts). Layout stays fixed; the tone controls background/text. Extracted
// from EvictionLeadsView.tsx and MlsLeadsView.tsx, which each independently
// defined an identical copy of this.
export type PillTone = 'grey' | 'blue' | 'warn' | 'danger' | 'success';

const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';

const PILL_TONE_CLASSES: Record<string, string> = {
  '': 'bg-muted text-muted-foreground',
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-success/15 text-success',
};

export const pillClass = (tone: string): string =>
  `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pillBadge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Point EvictionLeadsView.tsx at the shared module**

In `src/crm/views/EvictionLeadsView.tsx`, delete lines 66-75 (the `// Shared pill styling` comment through the local `pillClass` definition):

```ts
// Shared pill styling: layout stays fixed, tone controls background/text.
const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
const PILL_TONE_CLASSES: Record<string, string> = {
  '': 'bg-muted text-muted-foreground',
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
};
const pillClass = (tone: string) => `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;
```

Add to the top imports (after the existing `import { STAGES, ... } from '@/crm-evictions/constants';` line):

```ts
import { pillClass } from '@/lib/pillBadge';
```

`stageTone()` (the function immediately above the deleted block) is untouched.

- [ ] **Step 6: Point MlsLeadsView.tsx at the shared module**

In `src/components/mls/MlsLeadsView.tsx`, delete lines 113-123 (the `// Pill tone keyword...` comment through the local `pillClass` export):

```ts
// Pill tone keyword, translated to Tailwind classes via PILL_TONE_CLASSES.
const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
const PILL_TONE_CLASSES: Record<string, string> = {
  '': 'bg-muted text-muted-foreground',
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-success/15 text-success',
};
export const pillClass = (tone: string) => `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;
```

Add to its imports:

```ts
import { pillClass } from '@/lib/pillBadge';
```

Do **not** re-export `pillClass` from this file — Step 7 updates its two consumers to import it directly from the new module instead.

- [ ] **Step 7: Update the two files that imported `pillClass` from MlsLeadsView.tsx**

In `src/components/mls/SkipTraceQueue.tsx`, line 8 currently reads:

```ts
import { pillClass, statusTone } from './MlsLeadsView';
```

Change to two separate imports:

```ts
import { pillClass } from '@/lib/pillBadge';
import { statusTone } from './MlsLeadsView';
```

In `src/components/mls/MlsLeadDetails.tsx`, line 8 currently reads:

```ts
import { fmtDate, fmtMoney, ownerRoleLabels, pillClass, statusTone, type MlsContact, type MlsLead } from './MlsLeadsView';
```

Change to:

```ts
import { pillClass } from '@/lib/pillBadge';
import { fmtDate, fmtMoney, ownerRoleLabels, statusTone, type MlsContact, type MlsLead } from './MlsLeadsView';
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including the untouched `src/crm/views/EvictionLeadsView.test.ts` (still asserting `stageTone()`'s exact keyword outputs) and `src/components/mls/MlsLeadsView.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pillBadge.ts src/lib/pillBadge.test.ts src/crm/views/EvictionLeadsView.tsx src/components/mls/MlsLeadsView.tsx src/components/mls/SkipTraceQueue.tsx src/components/mls/MlsLeadDetails.tsx
git commit -m "refactor: extract duplicated pill-badge styling into src/lib/pillBadge.ts"
```

---

### Task 3: Revive and enhance `StatCard` with an icon-circle and arrow trend

**Files:**
- Modify: `src/components/dashboard/StatCard.tsx`
- Test: `src/components/dashboard/StatCard.test.tsx` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `StatCard` props change from `trend?: { value: number; label: string; isPositive?: boolean }` to `trend?: { direction: 'up' | 'down'; label: string }`. `variant` prop keeps its 5 existing values (`'default' | 'primary' | 'success' | 'warning' | 'danger'`). Task 6 renders 8 of these in the Dashboard's KPI row.

`StatCard` is already imported in `src/components/dashboard/Dashboard.tsx:3` (`import { StatCard } from './StatCard';`) but is never actually rendered anywhere in the codebase (`grep '<StatCard' src` returns nothing) — this task revives dead code rather than adding a parallel new component. Its `trend` prop is also unused anywhere currently, so its shape can change freely.

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/StatCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Building2 } from 'lucide-react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the title, value, and icon', () => {
    render(<StatCard title="Eviction Leads" value={3139} icon={Building2} variant="primary" />);
    expect(screen.getByText('Eviction Leads')).toBeTruthy();
    expect(screen.getByText('3,139')).toBeTruthy();
  });

  it('renders an upward trend with an up arrow', () => {
    render(<StatCard title="MLS Leads" value={10} trend={{ direction: 'up', label: '12% vs last 30 days' }} />);
    expect(screen.getByText(/▲/)).toBeTruthy();
    expect(screen.getByText(/12% vs last 30 days/)).toBeTruthy();
  });

  it('renders a downward trend with a down arrow', () => {
    render(<StatCard title="Overdue" value={2} trend={{ direction: 'down', label: '5% vs last 30 days' }} />);
    expect(screen.getByText(/▼/)).toBeTruthy();
  });

  it('wraps the icon in a tinted circle whose tint follows the variant', () => {
    const { container } = render(<StatCard title="Deals" value={8} icon={Building2} variant="success" />);
    const circle = container.querySelector('span.rounded-full');
    expect(circle).toBeTruthy();
    expect(circle?.className).toContain('bg-success/15');
    expect(circle?.className).toContain('text-success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/StatCard.test.tsx`
Expected: FAIL — no `▲`/`▼` text found (current trend markup renders `+`/`` prefixes, not arrows), and no `span.rounded-full` icon wrapper exists yet.

- [ ] **Step 3: Rewrite StatCard.tsx**

Replace the full contents of `src/components/dashboard/StatCard.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    direction: 'up' | 'down';
    label: string;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
}

const variantStyles = {
  default: 'border-border',
  primary: 'border-primary/30 bg-primary/5',
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  danger: 'border-judgment/30 bg-judgment/5',
};

const iconCircleStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-judgment/15 text-judgment',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  onClick,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'stat-card animate-fade-in',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02]'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        {Icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-full', iconCircleStyles[variant])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-semibold font-mono tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        {trend && (
          <div className={cn(
            'text-xs font-medium px-2 py-1 rounded-full',
            trend.direction === 'up'
              ? 'bg-success/20 text-success'
              : 'bg-judgment/20 text-judgment'
          )}>
            {trend.direction === 'up' ? '▲' : '▼'} {trend.label}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/StatCard.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All tests pass (no other file imports `StatCard`, so nothing else can regress).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/StatCard.tsx src/components/dashboard/StatCard.test.tsx
git commit -m "feat: revive StatCard with an icon-circle and arrow-style trend for the KPI dashboard"
```

---

### Task 4: Add `useEvictionLeadsCount` and `useMlsLeadsCount` hooks

**Files:**
- Create: `src/hooks/useLeadCounts.ts`
- Test: `src/hooks/useLeadCounts.test.ts`

**Interfaces:**
- Produces: `useEvictionLeadsCount(): UseQueryResult<number>` and `useMlsLeadsCount(): UseQueryResult<number>`.
- Consumed by: Task 6 (Dashboard KPI row).

Neither `EvictionLeadsView.tsx` nor `MlsLeadsView.tsx` uses React Query — both fetch via a local `request()`/`fetch()` helper directly in a `useEffect`. Each list endpoint already returns a `total` field (`data.total`), so a minimal page-size-1 request is enough to get a count without duplicating either view's full fetch logic. Query params are `page` and `pageSize` (confirmed in both views — not `limit`).

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useLeadCounts.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useEvictionLeadsCount, useMlsLeadsCount } from './useLeadCounts';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEvictionLeadsCount', () => {
  it('reads total from the landlords endpoint with a minimal page size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ items: [], total: 3139, pages: 3139 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEvictionLeadsCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(3139));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/evictions/landlords');
    expect(url).toContain('page=1');
    expect(url).toContain('pageSize=1');
  });
});

describe('useMlsLeadsCount', () => {
  it('reads total from the mls-leads endpoint with a minimal page size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ items: [], total: 2321, pages: 2321 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMlsLeadsCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(2321));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/mls-leads');
    expect(url).toContain('page=1');
    expect(url).toContain('pageSize=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useLeadCounts.test.ts`
Expected: FAIL — `Cannot find module './useLeadCounts'`

- [ ] **Step 3: Create the hooks**

Create `src/hooks/useLeadCounts.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';

async function fetchTotal(url: string): Promise<number> {
  const res = await fetch(url, { headers: getAuthHeaders() });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body.total ?? 0;
}

/** Total eviction-lead count, for the Dashboard KPI row. Reuses the same
 *  `/api/evictions/landlords` endpoint EvictionLeadsView.tsx lists from,
 *  requesting a single row purely to read the response's `total` field. */
export function useEvictionLeadsCount() {
  return useQuery<number>({
    queryKey: ['eviction-leads-count'],
    queryFn: () => fetchTotal(`${API_BASE_URL}/api/evictions/landlords?page=1&pageSize=1`),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

/** Total MLS-lead count, for the Dashboard KPI row. Same approach as
 *  useEvictionLeadsCount, against MlsLeadsView.tsx's `/api/mls-leads` list. */
export function useMlsLeadsCount() {
  return useQuery<number>({
    queryKey: ['mls-leads-count'],
    queryFn: () => fetchTotal(`${API_BASE_URL}/api/mls-leads/?page=1&pageSize=1`),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useLeadCounts.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLeadCounts.ts src/hooks/useLeadCounts.test.ts
git commit -m "feat: add lightweight eviction/MLS lead count hooks for the Dashboard"
```

---

### Task 5: Extract `useCalendarEvents` from CalendarView.tsx

**Files:**
- Create: `src/hooks/useCalendarEvents.ts`
- Test: `src/hooks/useCalendarEvents.test.ts`
- Modify: `src/components/calendar/CalendarView.tsx`

**Interfaces:**
- Produces: `useCalendarEvents(monthKey: string): CalendarEvent[]`, `type CalendarEvent`, `type CalendarEventKind = 'followup' | 'd4d' | 'crm'`, and `followUpTitle(fu: FollowUp): string` (re-exported, still used by `CalendarView.tsx`'s own detail-dialog rendering).
- Consumed by: Task 7 (Dashboard's Today's Schedule + Meetings This Week KPI) and Task 14 (Calendar's upcoming-events panel).

This moves the exact event-building logic that already exists in `CalendarView.tsx` (lines 115-124 and 150-210) into a shared hook, changing no behavior in `CalendarView.tsx` itself. `KIND_COLORS` (line 60-64) stays in `CalendarView.tsx` — it's presentation, not data — but gets `export`ed so Task 14 can reuse the same kind→color mapping.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCalendarEvents.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCalendarEvents } from './useCalendarEvents';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'raul' } }),
}));

vi.mock('@/hooks/useFollowUps', () => ({
  useFollowUps: () => ({
    data: [
      { id: 'fu1', date: '2026-09-15T00:00:00.000Z', completed: false, drivingLeadId: null },
    ],
  }),
}));

vi.mock('@/hooks/useDrivingLeads', () => ({
  useDrivingLeads: () => ({ data: [] }),
}));

vi.mock('@/crm/store/useCrmStore', () => ({
  useCrmStore: (selector: (s: any) => unknown) =>
    selector({ hydrate: vi.fn(), tasks: [], leads: [] }),
}));

describe('useCalendarEvents', () => {
  it('builds a followup-kind event from useFollowUps data', () => {
    const { result } = renderHook(() => useCalendarEvents('2026-09'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ id: 'fu1', kind: 'followup', allDay: true, completed: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useCalendarEvents.test.ts`
Expected: FAIL — `Cannot find module './useCalendarEvents'`

- [ ] **Step 3: Create the hook**

Create `src/hooks/useCalendarEvents.ts`:

```ts
import { useEffect, useMemo } from 'react';
import type { Event } from 'react-big-calendar';
import { useAuth } from '@/contexts/AuthContext';
import { useFollowUps } from '@/hooks/useFollowUps';
import { useDrivingLeads } from '@/hooks/useDrivingLeads';
import { useCrmStore } from '@/crm/store/useCrmStore';
import type { FollowUp, DrivingLead } from '@/types/property';

export type CalendarEventKind = 'followup' | 'd4d' | 'crm';

export type CalendarEvent = Event & {
  id: string;
  kind: CalendarEventKind;
  completed: boolean;
  payload:
    | FollowUp
    | DrivingLead
    | { id: string; leadId: string; type: string; dueAt: string; completed: boolean; notes: string; completedAt: string | null };
};

export function followUpTitle(fu: FollowUp): string {
  if (fu.drivingLead) return fu.drivingLead.street || fu.drivingLead.rawAddress || 'D4$ Lead';
  if (fu.property) return fu.property.propertyAddress || fu.property.ownerName || 'Property';
  if (fu.preForeclosure) return fu.preForeclosure.address || 'Pre-FC';
  return 'Follow-up';
}

function crmTaskDuration(type: string) {
  return type === 'Meeting' || type === 'Property Tour' ? 60 * 60 * 1000 : 30 * 60 * 1000;
}

/**
 * Builds the unified follow-up/D4$/CRM event feed CalendarView renders,
 * scoped to one month, so other screens (the Dashboard) can read the same
 * events without re-deriving them. A window spanning a month boundary (e.g.
 * "this week" near month-end) only sees events in `monthKey` — no current
 * caller needs a boundary-spanning query.
 */
export function useCalendarEvents(monthKey: string): CalendarEvent[] {
  const { data: followUps = [] } = useFollowUps(monthKey);
  const { data: drivingLeads = [] } = useDrivingLeads();
  const { user } = useAuth();
  const crmHydrate = useCrmStore((s) => s.hydrate);
  const crmTasks = useCrmStore((s) => s.tasks);
  const crmLeads = useCrmStore((s) => s.leads);

  useEffect(() => {
    crmHydrate(new Date(), user?.id);
  }, [crmHydrate, user?.id]);

  const crmLeadById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);

  return useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];

    for (const fu of followUps) {
      const day = new Date(fu.date);
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59);
      list.push({
        id: fu.id,
        kind: fu.drivingLeadId ? 'd4d' : 'followup',
        title: followUpTitle(fu),
        start: day,
        end,
        allDay: true,
        completed: fu.completed,
        payload: fu,
      });
    }

    for (const lead of drivingLeads) {
      const wf = (lead.metadata as any) || {};
      if (!wf.scheduledFollowUpAt) continue;
      const day = new Date(wf.scheduledFollowUpAt);
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59);
      const done = wf.lastFollowUpAt && new Date(wf.lastFollowUpAt) >= new Date(wf.scheduledFollowUpAt);
      list.push({
        id: `d4d-sched-${lead.id}`,
        kind: 'd4d',
        title: `D4$ ${lead.street || lead.rawAddress}`,
        start: day,
        end,
        allDay: true,
        completed: !!done,
        payload: lead,
      });
    }

    for (const task of crmTasks) {
      const lead = crmLeadById.get(task.leadId);
      const start = new Date(task.dueAt);
      const end = new Date(start.getTime() + crmTaskDuration(task.type));
      list.push({
        id: `crm-${task.id}`,
        kind: 'crm',
        title: `${task.type} · ${lead?.ownerName || lead?.businessName || 'Unknown'}`,
        start,
        end,
        allDay: false,
        completed: task.completed,
        payload: task,
      });
    }

    return list;
  }, [followUps, drivingLeads, crmTasks, crmLeadById]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useCalendarEvents.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Wire CalendarView.tsx to the new hook**

In `src/components/calendar/CalendarView.tsx`:

Remove the `type EventKind = ...` block (lines 51-58) and the `type CalEvent = Event & {...}` block — both now live in the hook.

Remove `followUpTitle()` (lines 115-120) and `crmTaskDuration()` (lines 122-124) — both moved to the hook.

Add `export` in front of `const KIND_COLORS` (line 60) so it reads `export const KIND_COLORS: Record<EventKind, ...>` — but since `EventKind` no longer exists locally, change its type annotation to use the imported `CalendarEventKind`:

```ts
export const KIND_COLORS: Record<CalendarEventKind, { bg: string; border: string; text: string; badge: string }> = {
  followup: { bg: '#1e3a5f',  border: '#3b82f6', text: '#93c5fd', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  d4d:      { bg: '#3b1f6b',  border: '#8b5cf6', text: '#c4b5fd', badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  crm:      { bg: '#78350f',  border: '#f59e0b', text: '#fcd34d', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};
```

Add to the imports:

```ts
import { useCalendarEvents, followUpTitle, type CalendarEvent as CalEvent, type CalendarEventKind } from '@/hooks/useCalendarEvents';
```

This alias (`CalendarEvent as CalEvent`) means every other `CalEvent` reference in this ~600-line file needs no change.

Remove `type Event,` from the existing `react-big-calendar` import (line 7) — after this refactor it's the only thing in this file that used that type, and it would otherwise be left as an unused import:

```ts
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type NavigateAction,
  type SlotInfo,
  type ToolbarProps,
  type View,
} from 'react-big-calendar';
```

In the component body, the block that currently reads (lines 135-147):

```ts
  const { data: followUps = [] } = useFollowUps(monthKey);
  const { data: drivingLeads = [] } = useDrivingLeads();
  const updateMutation = useUpdateFollowUp();
  const deleteMutation = useDeleteFollowUp();

  // CRM
  const { user } = useAuth();
  const crmHydrate = useCrmStore((s) => s.hydrate);
  const crmTasks = useCrmStore((s) => s.tasks);
  const crmLeads = useCrmStore((s) => s.leads);
  const crmReschedule = useCrmStore((s) => s.rescheduleTask);
  useEffect(() => { crmHydrate(new Date(), user?.id); }, [crmHydrate, user?.id]);
  const crmLeadById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);
```

becomes — `followUps`, `drivingLeads`, `crmHydrate`, `crmTasks`, and the `useAuth()`/hydrate-effect are all now handled inside `useCalendarEvents` itself; `crmLeads`/`crmReschedule`/`crmLeadById` stay because `onEventDrop`/`onEventResize`/`renderEventDetail` still use them outside the event-building logic:

```ts
  const updateMutation = useUpdateFollowUp();
  const deleteMutation = useDeleteFollowUp();

  // CRM
  const crmLeads = useCrmStore((s) => s.leads);
  const crmReschedule = useCrmStore((s) => s.rescheduleTask);
  const crmLeadById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);
  const events = useCalendarEvents(monthKey);
```

Then delete the entire old `const events = useMemo<CalEvent[]>(() => { ... }, [followUps, drivingLeads, crmTasks, crmLeadById]);` block (the old lines 150-210) — its logic now lives in the hook, and the line above already replaces it.

Delete the `import { useAuth } from '@/contexts/AuthContext';` line — nothing in this file calls it anymore.

Update the `@/hooks/useFollowUps` import — keep `useUpdateFollowUp`/`useDeleteFollowUp` (still used), drop `useFollowUps` (moved into the hook):

```ts
import { useUpdateFollowUp, useDeleteFollowUp } from '@/hooks/useFollowUps';
```

(this replaces the old `import { useFollowUps, useUpdateFollowUp, useDeleteFollowUp } from '@/hooks/useFollowUps';`)

Delete the `import { useDrivingLeads } from '@/hooks/useDrivingLeads';` line entirely — nothing in `CalendarView.tsx` calls it anymore.

(`monthKey` is unchanged, still `format(date, 'yyyy-MM')`, computed just above.)

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test`
Expected: All tests pass — no existing test file covers `CalendarView.tsx`'s rendering directly, so this is a behavior-preserving refactor with no test to update.

Run: `npm run build`
Expected: Build succeeds (confirms no leftover reference to the removed local `CalEvent`/`EventKind`/`followUpTitle`/`crmTaskDuration`).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCalendarEvents.ts src/hooks/useCalendarEvents.test.ts src/components/calendar/CalendarView.tsx
git commit -m "refactor: extract useCalendarEvents from CalendarView so the Dashboard can reuse the same event feed"
```

---

### Task 6: Dashboard — greeting header and 8-card KPI row

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`
- Test: `src/components/dashboard/Dashboard.test.tsx` (new)

**Interfaces:**
- Consumes: `StatCard` (Task 3), `useEvictionLeadsCount`/`useMlsLeadsCount` (Task 4), `useCalendarEvents` (Task 5, used here only for validation this task doesn't need it directly — the KPI row itself does not need calendar data, only Task 7's three-column row does).
- Produces: nothing new consumed by later tasks (Task 7 extends the same file/test directly after this task).

Everything below the existing `<Card>Call Activity</Card>` block (currently the first thing in `Dashboard.tsx`'s return statement, at line 145 of the file as it stood before this task) is unchanged — this task only adds a new section above it.

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/Dashboard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from './Dashboard';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'Raul' } }),
}));

vi.mock('@/hooks/useFiles', () => ({
  useDashboardStats: () => ({
    data: {
      totalProperties: 111,
      byStatus: { judgment: 0, active: 0, pending: 0 },
      totalAmountDue: 0,
      avgAmountDue: 0,
      newThisMonth: 0,
      removedThisMonth: 0,
      deadLeads: 0,
      pipeline: { totalValue: 12400000, activeDeals: 8, byStage: {}, conversionRate: 0, avgDealValue: 0 },
    },
    isLoading: false,
    error: null,
  }),
  useCallStats: () => ({ data: { daily: 0, weekly: 0, monthly: 0 } }),
  useCallActivity: () => ({ data: [] }),
  useTeamStats: () => ({ data: [] }),
}));

vi.mock('@/hooks/usePreForeclosure', () => ({
  usePreForeclosures: () => ({ data: Array.from({ length: 111 }, (_, i) => ({ id: String(i) })) }),
}));

vi.mock('@/hooks/useLeadCounts', () => ({
  useEvictionLeadsCount: () => ({ data: 3139 }),
  useMlsLeadsCount: () => ({ data: 2321 }),
}));

vi.mock('@/hooks/useFollowUps', () => ({
  useFollowUps: () => ({ data: [] }),
}));

vi.mock('@/hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => [],
}));

vi.mock('@/crm/store/useCrmStore', () => ({
  useCrmStore: (selector: (s: any) => unknown) =>
    selector({ leads: [{ id: 'l1', kind: 'industry' }, { id: 'l2', kind: 'retail' }], activities: [] }),
}));

describe('Dashboard KPI row', () => {
  it('greets the signed-in user by name', () => {
    render(<Dashboard />);
    expect(screen.getByText(/Raul/)).toBeTruthy();
  });

  it('renders all 8 KPI cards with their counts', () => {
    render(<Dashboard />);
    expect(screen.getByText('Eviction Leads')).toBeTruthy();
    expect(screen.getByText('3,139')).toBeTruthy();
    expect(screen.getByText('Pre-Foreclosures')).toBeTruthy();
    expect(screen.getByText('111')).toBeTruthy();
    expect(screen.getByText('MLS Leads')).toBeTruthy();
    expect(screen.getByText('2,321')).toBeTruthy();
    expect(screen.getByText('Key Relationships')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // one 'industry' lead in the mock
    expect(screen.getByText('Deals in Pipeline')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('Est. Acquisition Value')).toBeTruthy();
    expect(screen.getByText('$12,400,000')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL — none of the greeting/KPI text exists in the current Dashboard output.

- [ ] **Step 3: Add the greeting + KPI row**

In `src/components/dashboard/Dashboard.tsx`, add to the imports:

```ts
import { useAuth } from '@/contexts/AuthContext';
import { useEvictionLeadsCount, useMlsLeadsCount } from '@/hooks/useLeadCounts';
import { useFollowUps } from '@/hooks/useFollowUps';
import { useCrmStore } from '@/crm/store/useCrmStore';
import { CalendarClock, Handshake, Home, Users2, Wallet } from 'lucide-react';
import { format } from 'date-fns';
```

(`Building2`, `Users`, `Phone` etc. are already imported at the top of the file — keep those, just add the ones above.)

Inside the `Dashboard` component, before the existing `if (error)` early return, add:

```ts
  const { user } = useAuth();
  const { data: evictionLeadsCount } = useEvictionLeadsCount();
  const { data: mlsLeadsCount } = useMlsLeadsCount();
  const industryLeadsCount = useCrmStore((s) => s.leads.filter((l) => l.kind === 'industry').length);
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const { data: monthFollowUps = [] } = useFollowUps(currentMonthKey);
  const followUpsDueCount = monthFollowUps.filter((f) => !f.completed && new Date(f.date) <= new Date()).length;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  })();
```

`usePreForeclosures()` is already called near the top of the component body (`const { data: preForeclosureRecords, isLoading: isLoadingPreForeclosures } = usePreForeclosures();`, already before every hook added in this step) — reuse that same `preForeclosureRecords` variable for the Pre-Foreclosures KPI (`preForeclosureRecords?.length ?? 0`) rather than calling the hook a second time.

Immediately inside the `return (<div className="p-3 md:p-6 space-y-4 md:space-y-6">` wrapper, **before** the existing `{/* Call Activity */}` comment and its `<Card>`, insert:

```tsx
      {/* Greeting + KPI row */}
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">Good {greeting}, {user?.username ?? 'there'}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Eviction Leads" value={evictionLeadsCount ?? 0} icon={Home} variant="primary" />
        <StatCard title="Pre-Foreclosures" value={preForeclosureRecords?.length ?? 0} icon={Building2} variant="warning" />
        <StatCard title="MLS Leads" value={mlsLeadsCount ?? 0} icon={Building2} variant="primary" />
        <StatCard title="Key Relationships" value={industryLeadsCount} icon={Users2} variant="success" />
        <StatCard title="Follow-ups Due" value={followUpsDueCount} icon={CalendarClock} variant="warning" />
        <StatCard title="Meetings This Week" value={0} icon={Handshake} variant="primary" />
        <StatCard title="Deals in Pipeline" value={pipelineData.activeDeals} icon={Wallet} variant="success" />
        <StatCard title="Est. Acquisition Value" value={`$${pipelineData.totalValue.toLocaleString()}`} icon={Wallet} variant="success" />
      </div>
```

`safeStats` and `pipelineData` already exist earlier in this same function (defined before the `return`, per the file's existing structure) — this task reads them, it doesn't redefine them. "Meetings This Week" is hardcoded to `0` in this task; Task 7 replaces it with the real count once `useCalendarEvents` is wired in (kept separate so this task's diff stays focused on the count hooks it actually introduces).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx src/components/dashboard/Dashboard.test.tsx
git commit -m "feat: add greeting header and 8-card KPI row to the Dashboard"
```

---

### Task 7: Dashboard — Today's Schedule, Recent Activity, Quick Actions row

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`, `src/components/dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `useCalendarEvents` (Task 5), `useCrmStore`'s `activities` slice.
- Produces: nothing consumed by later tasks.

This task also replaces Task 6's hardcoded `Meetings This Week` value of `0` with the real count, now that `useCalendarEvents` is wired in.

- [ ] **Step 1: Extend the test**

Add to `src/components/dashboard/Dashboard.test.tsx`, replacing the `useCalendarEvents` mock at the top with one that returns real events, and adding an `activities` entry to the `useCrmStore` mock:

```tsx
vi.mock('@/hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => [
    { id: 'crm-1', kind: 'crm', title: 'Meeting · Jane Doe', start: new Date(), end: new Date(), allDay: false, completed: false, payload: {} },
  ],
}));
```

```tsx
vi.mock('@/crm/store/useCrmStore', () => ({
  useCrmStore: (selector: (s: any) => unknown) =>
    selector({
      leads: [{ id: 'l1', kind: 'industry', ownerName: 'Jane Doe' }, { id: 'l2', kind: 'retail' }],
      activities: [{ id: 'a1', leadId: 'l1', kind: 'note', body: 'Left a voicemail', timestamp: new Date().toISOString() }],
    }),
}));
```

Add a new test to the same `describe` block:

```tsx
  it("renders Today's Schedule, Recent Activity, and Quick Actions", () => {
    render(<Dashboard />);
    expect(screen.getByText("Today's Schedule")).toBeTruthy();
    expect(screen.getByText(/Meeting · Jane Doe/)).toBeTruthy();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Left a voicemail')).toBeTruthy();
    expect(screen.getByText('Quick Actions')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Scan Business Card|Add Contact/ })).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL — the new section doesn't exist yet.

- [ ] **Step 3: Add the three-column row**

In `src/components/dashboard/Dashboard.tsx`, add to the imports:

```ts
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { formatDistanceToNow, isToday } from 'date-fns';
import { ScanLine, UploadCloud, Search as SearchIcon, Building2 as ScrapeIcon } from 'lucide-react';
```

`Dashboard` currently takes only `{ onFilterChange }`. Add a second optional prop so Quick Actions can switch tabs:

Update the component signature:

```ts
export function Dashboard({ onFilterChange, onNavigateToTab }: DashboardProps) {
```

and the `DashboardProps` interface:

```ts
interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
  onNavigateToTab?: (tab: string) => void;
}
```

Inside the component body, alongside the other hook calls added in Task 6:

```ts
  const activities = useCrmStore((s) => s.activities);
  const crmLeads = useCrmStore((s) => s.leads);
  const crmLeadById = new Map(crmLeads.map((l) => [l.id, l]));
  const calendarEvents = useCalendarEvents(currentMonthKey);
  const todaysEvents = calendarEvents.filter((e) => isToday(e.start as Date)).sort((a, b) => (a.start as Date).getTime() - (b.start as Date).getTime());
  const startOfThisWeek = new Date();
  startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfThisWeek.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);
  const endOfThisWeek = new Date(startOfThisWeek);
  endOfThisWeek.setDate(endOfThisWeek.getDate() + 7);
  const meetingsThisWeekCount = calendarEvents.filter((e) => e.kind === 'crm' && (e.start as Date) >= startOfThisWeek && (e.start as Date) < endOfThisWeek).length;
  const recentActivities = [...activities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
```

Replace Task 6's hardcoded `<StatCard title="Meetings This Week" value={0} ... />` with:

```tsx
        <StatCard title="Meetings This Week" value={meetingsThisWeekCount} icon={Handshake} variant="primary" />
```

Immediately after the KPI row `<div className="grid grid-cols-2 md:grid-cols-4 gap-4">...</div>` added in Task 6, add:

```tsx
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todaysEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
            ) : (
              todaysEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-2 text-sm">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {event.allDay ? 'All day' : (event.start as Date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="truncate">{event.title as string}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="text-sm">
                  <p className="truncate">{activity.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {crmLeadById.get(activity.leadId)?.ownerName || crmLeadById.get(activity.leadId)?.businessName || 'Unknown contact'}
                    {' · '}
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start" onClick={() => onNavigateToTab?.('crm')}>
              <ScanLine className="h-4 w-4 mr-2" /> Add Contact
            </Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => onNavigateToTab?.('mls')}>
              <UploadCloud className="h-4 w-4 mr-2" /> Import connectMLS Export
            </Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => onNavigateToTab?.('upload')}>
              <UploadCloud className="h-4 w-4 mr-2" /> Upload Records
            </Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => onNavigateToTab?.('preforeclosure')}>
              <ScrapeIcon className="h-4 w-4 mr-2" /> Scrape Data
            </Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => onNavigateToTab?.('mls')}>
              <SearchIcon className="h-4 w-4 mr-2" /> Look up all businesses
            </Button>
          </CardContent>
        </Card>
      </div>
```

`Dashboard.tsx` does not currently import `Button` — add it to the imports added in this task:

```ts
import { Button } from '@/components/ui/button';
```

- [ ] **Step 4: Wire the new prop in Index.tsx**

`Dashboard` is rendered at two places in `src/pages/Index.tsx`'s `renderContent()` function (lines 134-163): the `case 'dashboard':` branch and the `default:` fallback branch. Add `onNavigateToTab={setActiveTab}` to both (`setActiveTab` is already in scope — it's used by the existing `onFilterChange` prop on the first one).

Change line 137 from:

```tsx
        return <Dashboard onFilterChange={() => setActiveTab('properties')} />;
```

to:

```tsx
        return <Dashboard onFilterChange={() => setActiveTab('properties')} onNavigateToTab={setActiveTab} />;
```

Change line 161 from:

```tsx
        return <Dashboard />;
```

to:

```tsx
        return <Dashboard onNavigateToTab={setActiveTab} />;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test`
Expected: All tests pass.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx src/components/dashboard/Dashboard.test.tsx src/pages/Index.tsx
git commit -m "feat: add Today's Schedule, Recent Activity, and Quick Actions to the Dashboard"
```

---

### Task 8: `D4dKanbanCard` component

**Files:**
- Create: `src/components/driving/D4dKanbanCard.tsx`
- Test: `src/components/driving/D4dKanbanCard.test.tsx`

**Interfaces:**
- Produces: `D4dKanbanCard({ lead: DrivingLead, onViewDetails?: (lead: DrivingLead) => void }): JSX.Element`.
- Consumed by: Task 9 (`D4dKanbanBoard`).

Modeled on the existing `src/crm/components/pipeline/KanbanCard.tsx` (address/title + subtitle + small badge, click to view details) rather than reusing `D4dPipelineView.tsx`'s stateful `renderNewCard`/`renderResearchCard`/etc. — those closures capture a dozen pieces of local state and mutation handlers from inside that component and are not safely extractable without a much larger, riskier refactor of working production code. The Kanban board's cards intentionally stay simpler than the funnel view's, matching the mock's simpler card content (address, city/state, a relative "added" time).

- [ ] **Step 1: Write the failing test**

Create `src/components/driving/D4dKanbanCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { D4dKanbanCard } from './D4dKanbanCard';
import type { DrivingLead } from '@/types/property';

const lead: DrivingLead = {
  id: 'lead-1',
  rawAddress: '4239 Northington St, San Antonio, TX',
  street: '4239 Northington St',
  city: 'San Antonio',
  state: 'TX',
  zip: '78201',
  status: 'NEW',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('D4dKanbanCard', () => {
  it('shows the street address and city/state', () => {
    render(<D4dKanbanCard lead={lead} />);
    expect(screen.getByText('4239 Northington St')).toBeTruthy();
    expect(screen.getByText('San Antonio, TX')).toBeTruthy();
  });

  it('calls onViewDetails with the lead when the view button is clicked', () => {
    const onViewDetails = vi.fn();
    render(<D4dKanbanCard lead={lead} onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(onViewDetails).toHaveBeenCalledWith(lead);
  });

  it('renders no view button when onViewDetails is not passed', () => {
    render(<D4dKanbanCard lead={lead} />);
    expect(screen.queryByRole('button', { name: /view details/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/driving/D4dKanbanCard.test.tsx`
Expected: FAIL — `Cannot find module './D4dKanbanCard'`

- [ ] **Step 3: Create the component**

Create `src/components/driving/D4dKanbanCard.tsx`:

```tsx
import { Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DrivingLead } from '@/types/property';

type D4dKanbanCardProps = {
  lead: DrivingLead;
  onViewDetails?: (lead: DrivingLead) => void;
};

export function D4dKanbanCard({ lead, onViewDetails }: D4dKanbanCardProps) {
  return (
    <div className="w-full rounded-md border border-border/70 bg-card p-3 text-left shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{lead.street || lead.rawAddress}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{lead.city}, {lead.state}</p>
        </div>
        {onViewDetails && (
          <button
            type="button"
            aria-label="View details"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            onClick={() => onViewDetails(lead)}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {lead.notes && <p className="mt-1.5 text-xs italic text-muted-foreground line-clamp-2">{lead.notes}</p>}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Added {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/driving/D4dKanbanCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/driving/D4dKanbanCard.tsx src/components/driving/D4dKanbanCard.test.tsx
git commit -m "feat: add D4dKanbanCard for the new D4$ pipeline board"
```

---

### Task 9: `D4dKanbanBoard` component

**Files:**
- Create: `src/components/driving/D4dKanbanBoard.tsx`
- Test: `src/components/driving/D4dKanbanBoard.test.tsx`

**Interfaces:**
- Consumes: `D4dKanbanCard` (Task 8), `useUpdateDrivingLead` from `src/hooks/useDrivingLeads.ts:34`.
- Produces: `D4dKanbanBoard({ leads: DrivingLead[], onViewDetails?: (lead: DrivingLead) => void }): JSX.Element`.
- Consumed by: Task 10 (`DrivingView`'s Board/Table toggle).

Built the same way as the existing `src/crm/components/pipeline/KanbanBoard.tsx`: `DragDropContext`/`Droppable`/`Draggable` from `@hello-pangea/dnd` (not `@dnd-kit`). Six columns: the five `PIPELINE_STAGES` already defined in `D4dPipelineView.tsx` (`NEW`/`RESEARCHING`/`FOUND_OBITUARY`/`CONTACTED`/`UNDER_CONTRACT`) plus a sixth `DEAD` column.

- [ ] **Step 1: Write the failing test**

Create `src/components/driving/D4dKanbanBoard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { D4dKanbanBoard } from './D4dKanbanBoard';
import type { DrivingLead } from '@/types/property';

const mutate = vi.fn();
vi.mock('@/hooks/useDrivingLeads', () => ({
  useUpdateDrivingLead: () => ({ mutate }),
}));

const leads: DrivingLead[] = [
  { id: '1', rawAddress: '1 Main St', street: '1 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'NEW', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: '2', rawAddress: '2 Main St', street: '2 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'RESEARCHING', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: '3', rawAddress: '3 Main St', street: '3 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'DEAD', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

describe('D4dKanbanBoard', () => {
  it('renders all 6 stage columns', () => {
    render(<D4dKanbanBoard leads={leads} />);
    expect(screen.getByText('Leads')).toBeTruthy();
    expect(screen.getByText('Researching')).toBeTruthy();
    expect(screen.getByText('Found Obituary')).toBeTruthy();
    expect(screen.getByText('Contacted')).toBeTruthy();
    expect(screen.getByText('Under Contract')).toBeTruthy();
    expect(screen.getByText('Dead Deal')).toBeTruthy();
  });

  it('places each lead card under its own stage column', () => {
    render(<D4dKanbanBoard leads={leads} />);
    expect(screen.getByText('1 Main St')).toBeTruthy();
    expect(screen.getByText('2 Main St')).toBeTruthy();
    expect(screen.getByText('3 Main St')).toBeTruthy();
  });

  it('shows an empty-state message for a stage with no leads', () => {
    render(<D4dKanbanBoard leads={[leads[0]]} />);
    expect(screen.getAllByText(/no leads/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/driving/D4dKanbanBoard.test.tsx`
Expected: FAIL — `Cannot find module './D4dKanbanBoard'`

- [ ] **Step 3: Create the component**

Create `src/components/driving/D4dKanbanBoard.tsx`:

```tsx
import { useMemo } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useUpdateDrivingLead } from '@/hooks/useDrivingLeads';
import type { DrivingLead, DrivingLeadStatus } from '@/types/property';
import { D4dKanbanCard } from './D4dKanbanCard';

type BoardStage = { key: DrivingLeadStatus; label: string };

const BOARD_STAGES: BoardStage[] = [
  { key: 'NEW', label: 'Leads' },
  { key: 'RESEARCHING', label: 'Researching' },
  { key: 'FOUND_OBITUARY', label: 'Found Obituary' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract' },
  { key: 'DEAD', label: 'Dead Deal' },
];

type D4dKanbanBoardProps = {
  leads: DrivingLead[];
  onViewDetails?: (lead: DrivingLead) => void;
};

export function D4dKanbanBoard({ leads, onViewDetails }: D4dKanbanBoardProps) {
  const updateMutation = useUpdateDrivingLead();

  const leadsByStage = useMemo(() => {
    const groups = new Map<DrivingLeadStatus, DrivingLead[]>();
    for (const stage of BOARD_STAGES) groups.set(stage.key, []);
    for (const lead of leads) groups.get(lead.status)?.push(lead);
    return groups;
  }, [leads]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const nextStatus = result.destination.droppableId as DrivingLeadStatus;
    const lead = leads.find((l) => l.id === result.draggableId);
    if (!lead || lead.status === nextStatus) return;
    updateMutation.mutate({ id: lead.id, status: nextStatus });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {BOARD_STAGES.map((stage) => {
          const stageLeads = leadsByStage.get(stage.key) ?? [];
          return (
            <Droppable key={stage.key} droppableId={stage.key}>
              {(provided, snapshot) => (
                <section
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`w-[290px] shrink-0 rounded-md border border-border/70 bg-card p-3 shadow-sm transition ${
                    snapshot.isDraggingOver ? 'border-primary/50 bg-accent/20' : ''
                  }`}
                >
                  <div className="mb-3 rounded-md bg-muted/50 p-3">
                    <h3 className="text-sm font-semibold">{stage.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{stageLeads.length} leads</p>
                  </div>

                  <div className="space-y-3">
                    {stageLeads.map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(dragProvided) => (
                          <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}>
                            <D4dKanbanCard lead={lead} onViewDetails={onViewDetails} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                        No leads in this stage.
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                </section>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/driving/D4dKanbanBoard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/driving/D4dKanbanBoard.tsx src/components/driving/D4dKanbanBoard.test.tsx
git commit -m "feat: add D4dKanbanBoard, a drag-and-drop board view for the D4$ pipeline"
```

---

### Task 10: Wire the Board/Table toggle into DrivingView

**Files:**
- Modify: `src/components/driving/DrivingView.tsx`
- Test: `src/components/driving/DrivingView.test.tsx` (new)

**Interfaces:**
- Consumes: `D4dKanbanBoard` (Task 9), existing `D4dPipelineView` (unchanged).

`D4dPipelineView` is currently rendered at `DrivingView.tsx:376-384`, inside the `activeTab === 'pipeline'` block, right after the search bar. This task adds a segmented Board/Table control directly above it and switches between the two views — no change to `D4dPipelineView` itself, no change to the search bar, address list, or heirs tab below it.

- [ ] **Step 1: Write the failing test**

Create `src/components/driving/DrivingView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrivingView } from './DrivingView';

vi.mock('@/hooks/useDrivingLeads', () => ({
  useDrivingLeads: () => ({
    data: [
      { id: '1', rawAddress: '1 Main St', street: '1 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'NEW', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    ],
    isLoading: false,
  }),
  useCreateDrivingLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDrivingLead: () => ({ mutate: vi.fn() }),
  useDeleteDrivingLead: () => ({ mutateAsync: vi.fn() }),
  useUploadDrivingPhotos: () => ({ mutateAsync: vi.fn() }),
  useDrivingPhotos: () => ({ data: [] }),
  useDeleteDrivingPhoto: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useFollowUps', () => ({
  useD4dFollowUps: () => ({ data: [] }),
}));

describe('DrivingView pipeline toggle', () => {
  it('shows the funnel (Table) view by default', () => {
    render(<DrivingView />);
    expect(screen.getByRole('button', { name: 'Table' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Board' })).toBeTruthy();
  });

  it('switches to the Kanban board when Board is clicked', () => {
    render(<DrivingView />);
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('Leads')).toBeTruthy();
    expect(screen.getByText('Dead Deal')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/driving/DrivingView.test.tsx`
Expected: FAIL — no "Board"/"Table" toggle buttons exist yet.

- [ ] **Step 3: Add the toggle**

In `src/components/driving/DrivingView.tsx`, add to the imports:

```ts
import { D4dKanbanBoard } from './D4dKanbanBoard';
import { cn } from '@/lib/utils'; // already imported — confirm, don't duplicate
```

(`cn` is already imported at line 15 — do not add a duplicate import line, only add the `D4dKanbanBoard` import.)

Inside `DrivingView`, alongside the existing `const [activeTab, setActiveTab] = useState<'pipeline' | 'heirs'>('pipeline');` state declaration, add:

```ts
  const [pipelineViewMode, setPipelineViewMode] = useState<'table' | 'board'>('table');
```

Replace the existing:

```tsx
          {/* D4$ Pipeline */}
          {leads.length > 0 && <D4dPipelineView
            leads={leads as any}
            onViewDetails={handleViewDetails}
            activeFilter={statusFilter}
            onStageFilter={(s) => {
              setStatusFilter(s);
              if (s) setShowAddresses(true);
            }}
          />}
```

with:

```tsx
          {/* D4$ Pipeline */}
          {leads.length > 0 && (
            <>
              <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setPipelineViewMode('table')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                    pipelineViewMode === 'table' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineViewMode('board')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                    pipelineViewMode === 'board' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Board
                </button>
              </div>

              {pipelineViewMode === 'table' ? (
                <D4dPipelineView
                  leads={leads as any}
                  onViewDetails={handleViewDetails}
                  activeFilter={statusFilter}
                  onStageFilter={(s) => {
                    setStatusFilter(s);
                    if (s) setShowAddresses(true);
                  }}
                />
              ) : (
                <D4dKanbanBoard leads={leads as any} onViewDetails={handleViewDetails} />
              )}
            </>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/driving/DrivingView.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: All tests pass.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/driving/DrivingView.tsx src/components/driving/DrivingView.test.tsx
git commit -m "feat: add a Board/Table toggle to the D4\$ pipeline"
```

---

### Task 11: Eviction Leads — add an Eye icon row-action

**Files:**
- Modify: `src/crm/views/EvictionLeadsView.tsx`
- Test: `src/crm/views/EvictionLeadsView.render.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new — uses the existing `open(id: string)` function already defined in this file.

Currently the only way into a landlord's detail dialog is clicking anywhere on its table row. This adds a visible `Eye` icon button as an explicit affordance, calling the same `open()` function the row click already uses — both paths lead to the same dialog, matching Pre-Foreclosure's existing icon-action pattern.

- [ ] **Step 1: Write the failing test**

Create `src/crm/views/EvictionLeadsView.render.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EvictionLeadsView from './EvictionLeadsView';

vi.mock('@/components/contacts/ContactWorkspace', () => ({
  ContactWorkspace: () => null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(listBody: unknown, detailBody: unknown) {
  return vi.fn((url: string) => {
    const isDetail = /\/landlords\/[^/?]+$/.test(url);
    return Promise.resolve({
      ok: true,
      text: async () => JSON.stringify(isDetail ? detailBody : listBody),
    });
  });
}

describe('EvictionLeadsView row actions', () => {
  it('renders an Eye icon per row that opens the same detail view as clicking the row', async () => {
    const listBody = {
      items: [{ id: 'e1', name: 'SANCHEZ, GERARDO', isCorporate: false, contactStage: 'New Lead', serviceInterests: [], contacts: {}, notes: '', filingCount: 1, addressCount: 1, ownedPropertyCount: 0 }],
      total: 1,
      pages: 1,
    };
    const detailBody = { ...listBody.items[0], addresses: [], filings: [], activities: [], tasks: [], contacts: {} };
    const fetchMock = mockFetch(listBody, detailBody);
    vi.stubGlobal('fetch', fetchMock);

    render(<EvictionLeadsView />);
    await waitFor(() => expect(screen.getByText('SANCHEZ, GERARDO')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    await waitFor(() => {
      const detailCall = fetchMock.mock.calls.find(([url]) => /\/landlords\/e1$/.test(url as string));
      expect(detailCall).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/crm/views/EvictionLeadsView.render.test.tsx`
Expected: FAIL — no element with an accessible name matching "view details" exists yet.

- [ ] **Step 3: Add the Actions column**

In `src/crm/views/EvictionLeadsView.tsx`, add `Eye` to the existing lucide-react import (line 6):

```ts
import { Building2, ChevronLeft, ChevronRight, ExternalLink, Eye, Loader2, Search, Upload, User } from 'lucide-react';
```

Change the header row (line 273) from:

```tsx
<thead><tr>{['Landlord', 'Entity', 'Filings', 'Addresses Represented', 'Properties', 'Latest Filing', 'Contact Stage', 'Service Interest', 'Next Follow-up'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
```

to:

```tsx
<thead><tr>{['Landlord', 'Entity', 'Filings', 'Addresses Represented', 'Properties', 'Latest Filing', 'Contact Stage', 'Service Interest', 'Next Follow-up', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
```

Add a new `<td>` immediately after the existing `<td className="whitespace-nowrap record">{fmt(item.nextTask?.dueAt)}</td>` (line 284), inside the row `map`:

```tsx
              <td onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label="View details"
                  className="rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  onClick={() => open(item.id)}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </td>
```

Update both `colSpan={9}` occurrences (the loading-row and the empty-state row, lines 275 and 286) to `colSpan={10}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/crm/views/EvictionLeadsView.render.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including the untouched `src/crm/views/EvictionLeadsView.test.ts` (`stageTone()` keyword assertions).

- [ ] **Step 6: Commit**

```bash
git add src/crm/views/EvictionLeadsView.tsx src/crm/views/EvictionLeadsView.render.test.tsx
git commit -m "feat: add a visible Eye icon row-action to Eviction Leads"
```

---

### Task 12: MLS Leads — add an Eye icon row-action

**Files:**
- Modify: `src/components/mls/MlsLeadsView.tsx`
- Test: `src/components/mls/MlsLeadsView.render.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new — uses the existing `open(id: string)` function already defined in this file (same pattern as Eviction, confirmed by the shared `cursor-pointer` row + `onClick={() => open(item.id)}` at line 464).

- [ ] **Step 1: Write the failing test**

Create `src/components/mls/MlsLeadsView.render.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MlsLeadsView from './MlsLeadsView';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(listBody: unknown, detailBody: unknown) {
  return vi.fn((url: string) => {
    const isDetail = /\/api\/mls-leads\/[^/?]+$/.test(url);
    return Promise.resolve({
      ok: true,
      text: async () => JSON.stringify(isDetail ? detailBody : listBody),
    });
  });
}

describe('MlsLeadsView row actions', () => {
  it('renders an Eye icon per row alongside Hide, opening the same detail as clicking the row', async () => {
    const item = { id: 'm1', address: '123 Main St', status: 'ACT', totalUnits: 2, price: 300000, county: 'Bexar', hidden: false, contacts: [] };
    const listBody = { items: [item], total: 1, pages: 1 };
    const fetchMock = mockFetch(listBody, item);
    vi.stubGlobal('fetch', fetchMock);

    render(<MlsLeadsView />);
    await waitFor(() => expect(screen.getByText('123 Main St')).toBeTruthy());

    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    await waitFor(() => {
      const detailCall = fetchMock.mock.calls.find(([url]) => /\/api\/mls-leads\/m1$/.test(url as string));
      expect(detailCall).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/mls/MlsLeadsView.render.test.tsx`
Expected: FAIL — no element with an accessible name matching "view details" exists yet.

- [ ] **Step 3: Add the Eye icon alongside Hide/Unhide**

In `src/components/mls/MlsLeadsView.tsx`, change line 3 from:

```ts
import { Building2, ChevronLeft, ChevronRight, Loader2, PhoneCall, Search, Upload, User } from 'lucide-react';
```

to:

```ts
import { Building2, ChevronLeft, ChevronRight, Eye, Loader2, PhoneCall, Search, Upload, User } from 'lucide-react';
```

Change the actions cell (line 497-499) from:

```tsx
                <td>
                  <button className="rounded border bg-card px-2 py-1 text-xs hover:bg-muted" onClick={(e) => toggleHidden(item, e)}>{item.hidden ? 'Unhide' : 'Hide'}</button>
                </td>
```

to:

```tsx
                <td onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="View details"
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    onClick={() => open(item.id)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button className="rounded border bg-card px-2 py-1 text-xs hover:bg-muted" onClick={(e) => toggleHidden(item, e)}>{item.hidden ? 'Unhide' : 'Hide'}</button>
                </td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/mls/MlsLeadsView.render.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All tests pass, including the untouched `src/components/mls/MlsLeadsView.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/mls/MlsLeadsView.tsx src/components/mls/MlsLeadsView.render.test.tsx
git commit -m "feat: add a visible Eye icon row-action to MLS Leads, alongside Hide/Unhide"
```

---

### Task 13: Contacts — Active/Inactive badge column

**Files:**
- Modify: `src/crm/components/leads/LeadsTable.tsx`
- Test: `src/crm/components/leads/LeadsTable.test.tsx` (new)

**Interfaces:**
- Consumes: `pillClass` from `src/lib/pillBadge.ts` (Task 2).

Contacts is the one table genuinely missing a status pill (confirmed — no `rounded-full`/`pillClass`/`Badge` usage anywhere in `LeadsTable.tsx`). Derives Active/Inactive from `Lead.lastContactedAt: string | null` (`src/crm/data/types.ts:177`) — active if contacted within the last 90 days.

- [ ] **Step 1: Write the failing test**

Create `src/crm/components/leads/LeadsTable.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadsTable } from './LeadsTable';
import type { Lead } from '@/crm/data/types';

const baseLead: Lead = {
  id: 'l1',
  businessName: 'Acme Realty',
  ownerName: 'Jane Doe',
  city: 'San Antonio',
  kind: 'industry',
  lastContactedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as Lead;

const noop = () => {};

describe('LeadsTable status badge', () => {
  it('shows Active for a lead contacted within the last 90 days', () => {
    const recentlyContacted: Lead = { ...baseLead, lastContactedAt: new Date().toISOString() };
    render(<LeadsTable leads={[recentlyContacted]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows Inactive for a lead never contacted', () => {
    render(<LeadsTable leads={[baseLead]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows Inactive for a lead last contacted over 90 days ago', () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 120);
    const stale: Lead = { ...baseLead, lastContactedAt: staleDate.toISOString() };
    render(<LeadsTable leads={[stale]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/crm/components/leads/LeadsTable.test.tsx`
Expected: FAIL — no "Active"/"Inactive" text rendered yet.

- [ ] **Step 3: Add the Status column**

In `src/crm/components/leads/LeadsTable.tsx`, add to the imports:

```ts
import { pillClass } from '@/lib/pillBadge'
```

Above the `LeadsTable` function, add:

```ts
const ACTIVE_WINDOW_DAYS = 90

function isActiveLead(lead: Lead): boolean {
  if (!lead.lastContactedAt) return false
  const daysSinceContact = (Date.now() - new Date(lead.lastContactedAt).getTime()) / 86_400_000
  return daysSinceContact <= ACTIVE_WINDOW_DAYS
}
```

Add a new `<th>` immediately before the existing `<th className="px-4 py-3 text-left font-medium">Schedule</th>` (line 40):

```tsx
            <th className="px-4 py-3 text-left font-medium">Status</th>
```

Add a matching `<td>` immediately before the existing Schedule `<td>` (the one containing the "Schedule a meeting" button, starting at line 92):

```tsx
              <td className="px-4 py-3">
                <span className={pillClass(isActiveLead(lead) ? 'success' : 'grey')}>
                  {isActiveLead(lead) ? 'Active' : 'Inactive'}
                </span>
              </td>
```

Update `colSpan={11}` (line 106, the empty-state row) to `colSpan={12}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/crm/components/leads/LeadsTable.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/crm/components/leads/LeadsTable.tsx src/crm/components/leads/LeadsTable.test.tsx
git commit -m "feat: add an Active/Inactive status badge to the Contacts table"
```

---

### Task 14: Calendar — Upcoming Events side panel

**Files:**
- Create: `src/components/calendar/UpcomingEventsPanel.tsx`
- Test: `src/components/calendar/UpcomingEventsPanel.test.tsx`
- Modify: `src/components/calendar/CalendarView.tsx`

**Interfaces:**
- Consumes: `CalendarEvent` type (Task 5), `KIND_COLORS` (exported from `CalendarView.tsx` in Task 5).
- Produces: `UpcomingEventsPanel({ events: CalendarEvent[] }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `src/components/calendar/UpcomingEventsPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingEventsPanel } from './UpcomingEventsPanel';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    kind: 'followup',
    title: 'Follow up with Jane',
    start: new Date(),
    end: new Date(),
    allDay: true,
    completed: false,
    payload: {} as never,
    ...overrides,
  };
}

describe('UpcomingEventsPanel', () => {
  it('lists upcoming, incomplete events sorted soonest-first', () => {
    const soon = makeEvent({ id: 'soon', title: 'Soon event', start: new Date(Date.now() + 3600_000) });
    const later = makeEvent({ id: 'later', title: 'Later event', start: new Date(Date.now() + 7200_000) });
    render(<UpcomingEventsPanel events={[later, soon]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Soon event');
    expect(items[1].textContent).toContain('Later event');
  });

  it('excludes completed and past events', () => {
    const completed = makeEvent({ id: 'done', title: 'Done event', completed: true, start: new Date(Date.now() + 3600_000) });
    const past = makeEvent({ id: 'past', title: 'Past event', start: new Date(Date.now() - 3600_000) });
    render(<UpcomingEventsPanel events={[completed, past]} />);
    expect(screen.queryByText('Done event')).toBeNull();
    expect(screen.queryByText('Past event')).toBeNull();
  });

  it('shows an empty-state message when there are no upcoming events', () => {
    render(<UpcomingEventsPanel events={[]} />);
    expect(screen.getByText(/no upcoming events/i)).toBeTruthy();
  });

  it('caps the list at 10 events', () => {
    const events = Array.from({ length: 15 }, (_, i) => makeEvent({ id: `e${i}`, title: `Event ${i}`, start: new Date(Date.now() + (i + 1) * 3600_000) }));
    render(<UpcomingEventsPanel events={events} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/calendar/UpcomingEventsPanel.test.tsx`
Expected: FAIL — `Cannot find module './UpcomingEventsPanel'`

- [ ] **Step 3: Create the component**

Create `src/components/calendar/UpcomingEventsPanel.tsx`:

```tsx
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { KIND_COLORS } from './CalendarView';

type UpcomingEventsPanelProps = {
  events: CalendarEvent[];
};

export function UpcomingEventsPanel({ events }: UpcomingEventsPanelProps) {
  const now = new Date();
  const upcoming = events
    .filter((e) => !e.completed && (e.start as Date) >= now)
    .sort((a, b) => (a.start as Date).getTime() - (b.start as Date).getTime())
    .slice(0, 10);

  return (
    <div className="rounded-md border border-border/70 bg-card p-3 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">Upcoming Events</h3>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming events.</p>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: KIND_COLORS[event.kind].border }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{event.title as string}</p>
                <p className="text-xs text-muted-foreground">
                  {(event.start as Date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {!event.allDay && ` · ${(event.start as Date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/calendar/UpcomingEventsPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the panel into CalendarView.tsx**

In `src/components/calendar/CalendarView.tsx`, add to the imports:

```ts
import { UpcomingEventsPanel } from './UpcomingEventsPanel';
```

Change the outer return wrapper from:

```tsx
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="rounded-md border border-border/70 bg-card p-3 shadow-sm calendar-container">
        <DragAndDropCalendar
          ...
        />
      </div>

      {/* Event detail dialog */}
```

to:

```tsx
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-md border border-border/70 bg-card p-3 shadow-sm calendar-container">
          <DragAndDropCalendar
            ...
          />
        </div>
        <UpcomingEventsPanel events={events} />
      </div>

      {/* Event detail dialog */}
```

(Leave the `<DragAndDropCalendar ... />` props exactly as they are — only its wrapping `<div>` changes, from a direct child of the outer container to a child of a new two-column grid alongside the panel. Close the new grid `</div>` right after `<UpcomingEventsPanel events={events} />`.)

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test`
Expected: All tests pass.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/calendar/UpcomingEventsPanel.tsx src/components/calendar/UpcomingEventsPanel.test.tsx src/components/calendar/CalendarView.tsx
git commit -m "feat: add an Upcoming Events side panel to the Calendar"
```

---

## Final verification

- [ ] Run `npm run lint` — expected: no new lint errors introduced by this plan's files (pre-existing lint debt elsewhere is out of scope).
- [ ] Run `npm test` — expected: full suite green.
- [ ] Run `npm run build` — expected: succeeds.
- [ ] Manually smoke-test in the browser (`npm run dev`): Dashboard shows the greeting + 8 KPI cards + three-column row above the existing charts; Driving 4$ has a working Board/Table toggle with drag-and-drop between columns; Eviction Leads and MLS Leads each show an Eye icon per row; Contacts shows an Active/Inactive badge; Calendar shows the Upcoming Events panel alongside the existing calendar.
