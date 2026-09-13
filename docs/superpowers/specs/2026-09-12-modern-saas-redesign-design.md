# Modern SaaS Redesign — Design

**Date:** 2026-09-12
**Status:** Approved for planning

## Context

The user supplied a visual mockup of a target CRM look (dark navy sidebar,
light workspace, KPI-card dashboard, colored status pills, a Kanban pipeline
board, a two-panel calendar) and asked for the app to look like it. This
covers the whole app, not one screen, so it needs a spec before a plan.

A survey of the current codebase (recorded here so later tasks don't need to
re-derive it) found:

| Area | Current state | File(s) |
| --- | --- | --- |
| Sidebar | Already dark navy (`hsl(var(--navy))`), single-column nav list — close to the mock already | `src/components/layout/Sidebar.tsx` |
| TopBar | Already has global search (⌘K dialog) + notifications bell with unread dot | `src/components/layout/TopBar.tsx` |
| User profile chip | Lives in the Sidebar footer by deliberate prior choice (code comment: "desktop account menu lives in Sidebar's footer") — **not** moving this | `src/components/layout/Sidebar.tsx` |
| Dashboard | A dark, chart-heavy "team call/activity" page (recharts bar charts, per-rep leaderboards) — a different product than the mock's KPI-card home screen | `src/components/dashboard/Dashboard.tsx` |
| Contacts | Table view already; columns are Job Title/Industry, Name, City, Firm, Email, Phone, Asset, Specialization, Updated Notes, Met Personally, Schedule — different column set than the mock, no colored status pill | `src/crm/views/ContactsView.tsx`, `src/crm/components/leads/LeadsTable.tsx` |
| Eviction/MLS badges | Already pill-shaped (`rounded-full`, `bg-{tone}/15 text-{tone}`) — both files independently define an **identical, copy-pasted** `PILL_BASE`/`PILL_TONE_CLASSES`/`pillClass()` (tones: `grey`/`blue`/`warn`/`danger`/`success`). Already matches the mock's look; the real gap is duplication, not appearance | `src/crm/views/EvictionLeadsView.tsx`, `src/components/mls/MlsLeadsView.tsx` |
| Pre-Foreclosure badges | A third, separate convention — shadcn `<Badge variant="outline">` with raw Tailwind colors (`bg-blue-500/20` etc., see `WorkflowStageBadge.tsx`). Already pill-shaped by shadcn's default styling. Left alone per the "not touching Pre-Foreclosure" decision below | `src/components/preforeclosure/WorkflowStageBadge.tsx` |
| D4$ Pipeline | A collapsible funnel-bar widget (percentage bars that expand into a card grid) — **no board view at all** | `src/components/driving/D4dPipelineView.tsx` |
| Existing Kanban board (different feature) | A **fully working** drag-and-drop board already exists for the separate "Opportunities" pipeline, built on `@hello-pangea/dnd`. This is the pattern to copy, not `@dnd-kit` (which is installed but unused) | `src/crm/components/pipeline/KanbanBoard.tsx`, `KanbanCard.tsx` |
| Eviction Leads | Search + ~8 filters + table with a pill "Contact Stage" badge; row click opens a detail dialog, no icon actions | `src/crm/views/EvictionLeadsView.tsx` |
| MLS Leads | Search + filters + table with a pill "Status" badge; single text button per row ("Hide"/"Unhide"), no icon actions | `src/components/mls/MlsLeadsView.tsx` |
| Pre-Foreclosure | 4,049 lines — already has a colored status badge and icon row-actions (Eye/Send/Trash2). Largest, riskiest file in the app | `src/components/preforeclosure/PreForeclosureView.tsx` |
| Calendar | `react-big-calendar` with drag-and-drop, Month/Week/Day/Agenda toggle, unified event feed (`followup`/`d4d`/`crm` kinds) — no side list panel | `src/components/calendar/CalendarView.tsx` |
| Design tokens | `src/index.css` states its own philosophy in a comment: *"Institutional, not rounded. Hairlines carry the structure."* Single `--radius: 0.625rem`, one gold accent, plus four unused-for-badges hue tokens (`--mgmt`, `--lending`, `--listing`, `--acq`) already sitting in the palette | `src/index.css` |

## Decisions

| Question | Decision |
| --- | --- |
| Design token direction | Full replace of the *aesthetic rules* (rounded, soft, colorful) — not a full replace of the *brand* (navy sidebar stays; it already matches the mock). |
| Team-activity charts on Dashboard | Keep them. New KPI/schedule/activity section goes above the existing charts on the same page — nothing is removed or relocated. |
| D4$ Kanban | Real drag-and-drop, built the same way the existing Opportunities board is built (`@hello-pangea/dnd`), not a dropdown-based fake board. |
| User profile chip location | Unchanged — stays in the Sidebar footer. The mock's top-right avatar is not being copied; that was a deliberate prior decision (see Sidebar.tsx comment) and nothing here overrides it. |
| Pre-Foreclosure table | Picks up the new `--radius` automatically (shadcn `Card`/`Badge`/`Button` already read that CSS variable) with zero file edits — its 4,049-line structure is **not** refactored or otherwise touched in this project, too large/risky to bundle in. |

## Design tokens (`src/index.css`)

Current:

```css
--radius: 0.625rem;   /* "Institutional, not rounded." */
```

New:

```css
--radius: 1rem;        /* rounded-lg = 1rem, rounded-md = 0.875rem, rounded-sm = 0.75rem via tailwind.config's existing calc() mapping — no tailwind.config change needed */
```

Add elevation (there is currently no shadow token in this codebase; components
use bare Tailwind `shadow-sm`/`shadow` utilities, so no new CSS variable is
needed — just apply `shadow-sm` to `.stat-card` and any new card-shaped
component).

Update `.stat-card` (currently `bg-card border border-border rounded-lg p-4
transition-all duration-200 hover:border-primary/30`) to also carry `shadow-sm
hover:shadow-md` so cards read as raised, not just outlined.

`.status-badge` (currently `inline-flex items-center px-2 py-0.5 rounded
text-xs font-medium`, backing the existing `src/components/ui/StatusBadge.tsx`
— the Property J/A/P/U status codes, a narrow component unrelated to the CRM
tables below) changes `rounded` → `rounded-full`. This is a one-line,
purely-visual change: the three `.status-judgment`/`.status-active`/
`.status-pending` classes keep their exact colors, just pill-shaped now.
Nothing else about that component changes.

**Do not build a second component also named `StatusBadge`.** Eviction Leads
and MLS Leads already have their own, already-pill-shaped badge system —
each file independently defines an identical `PILL_BASE` / `PILL_TONE_CLASSES`
(`grey`/`blue`/`warn`/`danger`/`success`) / `pillClass()`. The actual gap is
duplication, not appearance. See "Shared components" below.

## Shared components

### `src/lib/pillBadge.ts` — extract, don't reinvent

Move the identical `PILL_BASE`, `PILL_TONE_CLASSES`, and `pillClass()` found
in both `src/crm/views/EvictionLeadsView.tsx` and
`src/components/mls/MlsLeadsView.tsx` into one new file:

```ts
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

export const pillClass = (tone: string) => `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;
```

Both files replace their local copy with `import { pillClass } from
'@/lib/pillBadge'`. **`EvictionLeadsView.tsx`'s own `stageTone()` function
stays exactly as-is** (it has test coverage asserting its exact keyword
outputs, per the comment at line 48-49) — only the thing it feeds
(`pillClass`) moves, its behavior is unchanged.

Contacts (`src/crm/components/leads/LeadsTable.tsx`, which currently has no
status badge at all) imports the same `pillClass()` for a new Active/Inactive
column — `pillClass('success')` / `pillClass('grey')` — rather than
introducing a third badge convention.

### `StatCard` (revived, not `KpiStatCard`) — deviation from this spec

**As implemented:** the plan (`docs/superpowers/plans/2026-09-12-modern-saas-redesign.md`,
Task 3) revived the existing but dead `src/components/dashboard/StatCard.tsx`
(imported in `Dashboard.tsx` but never rendered anywhere) instead of building
a new `KpiStatCard` component as originally specified below. Discovered while
writing the plan: `StatCard` already had ~90% of this shape (icon, value,
trend, variant-tinted styling) sitting unused, so extending it was lower-risk
and less code than a parallel component. Its final props:
`{ title, value, subtitle?, icon?, trend?: { direction: 'up'|'down'; label: string },
variant?: 'default'|'primary'|'success'|'warning'|'danger', onClick? }` — same
icon-circle-plus-arrow-trend look this section describes, reusing the same
tone tokens. The spec's original text for `KpiStatCard` is kept below for
historical context but was not built as its own file.

### `src/components/ui/kpi-stat-card.tsx` — `KpiStatCard` (original spec, superseded above)

```ts
interface KpiStatCardProps {
  icon: LucideIcon;
  iconTone: 'success' | 'warning' | 'info' | 'destructive' | 'neutral';
  label: string;
  value: string | number;
  trend?: { direction: 'up' | 'down'; label: string }; // e.g. { direction: 'up', label: '12% vs last 30 days' }
}
```

Renders a `.stat-card`-styled card: icon in a tinted circle (background =
token at 15% opacity, icon = token at full — reuse `--success`/`--warning`/
`--lending` (as "info")/`--destructive`/`--muted-foreground` (as "neutral"),
the same tokens already in the palette), big bold number, label beneath,
optional trend pill (green up-arrow / red down-arrow + text) top-right —
matching the mock's KPI tiles (icon circle + number + label + trend row).

### `src/components/ui/search-filter-bar.tsx` — `SearchFilterBar` (new)

```ts
interface SearchFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode; // caller renders its own <Select> filter controls here
  actions?: ReactNode; // right-aligned buttons, e.g. "+ Add Contact"
}
```

Renders the bordered-card search+filter row (search input with a leading
search icon, filter slot, actions slot right-aligned) so Contacts, Eviction,
and MLS stop each implementing their own filter-row container markup. This
does **not** touch each page's actual filter *logic* (the Select components
and their state stay in each view) — it only standardizes the outer
container, spacing, and the search input.

## Dashboard (`src/components/dashboard/Dashboard.tsx`)

Add a new section **above** the existing `<Card>Call Activity</Card>` block
(the file's first return content at line 145) — nothing below that line
changes. New section, top to bottom:

1. **Greeting header** — `Good {timeOfDay}, {user.username}` (compute
   morning/afternoon/evening from `new Date().getHours()`), current date
   (`format(new Date(), 'EEEE, MMM d, yyyy')`), and city/temperature is
   **out of scope** (no weather API in this project — omit that part of the
   mock rather than fake it).
2. **KPI row** — 8 `KpiStatCard`s in a `grid grid-cols-2 md:grid-cols-4 gap-4`,
   sourced as follows (every source already exists — no new backend
   endpoint needed):

   | Card | Source |
   | --- | --- |
   | Eviction Leads | `EvictionLeadsView.tsx` fetches via a plain `request('/landlords?...')` call (no React Query), and the response already carries `total` (`setTotal(data.total)`). Add a small new hook `src/hooks/useEvictionLeadsCount.ts` — a `useQuery` wrapping the same `/landlords` endpoint with a minimal page size (e.g. `?page=1&limit=1`), returning `data.total`. |
   | Pre-Foreclosures | `usePreForeclosures().data.length` (already imported in Dashboard.tsx, already React Query) |
   | MLS Leads | Same situation as Eviction — `MlsLeadsView.tsx` also uses a plain `request('/?...')` fetch with a `total` in its response. Add `src/hooks/useMlsLeadsCount.ts` the same way, hitting `${API_BASE_URL}/api/mls-leads` with a minimal page size. |
   | Key Relationships | `useCrmStore(s => s.leads).filter(l => l.kind === 'industry').length` |
   | Follow-ups Due | From `useFollowUps(currentMonth)`: count where `!completed && new Date(date) <= now` |
   | Meetings This Week | From the same unified event feed pattern `CalendarView.tsx` builds (`kind === 'crm'`), filtered to the current week — extract that feed-building logic into a shared hook (`src/hooks/useCalendarEvents.ts`) so both Calendar and Dashboard read for it instead of duplicating it |
   | Deals in Pipeline | `stats.pipeline.activeDeals` (already in `DashboardStats`) |
   | Est. Acquisition Value | `stats.pipeline.totalValue` (already in `DashboardStats`), formatted via the existing `formatCurrency` helper from `@/crm/lib/utils` |

3. **Three-column row** (`grid lg:grid-cols-3 gap-4`):
   - **Today's Schedule** — today's events from the new `useCalendarEvents`
     hook, sorted by time, showing time + title + subtitle (reuse
     `CalEvent`'s existing fields).
   - **Recent Activity** — `useCrmStore(s => s.activities)` (`Activity =
     { id, leadId, kind, body, timestamp }`, `src/crm/data/types.ts:202-208`)
     already exists as a store slice. Sort by `timestamp` descending, take
     the most recent 5, render `body` + relative time
     (`formatDistanceToNow`, already a project dependency via `date-fns`)
     + the lead's name via `leadById.get(activity.leadId)`.
   - **Quick Actions** — buttons wired to existing flows, no new
     functionality: "Add Contact" switches to the CRM tab and opens the
     business-card scanner (the actual add-contact flow — `ContactsView.tsx`
     has no plain add-contact form, only `setScannerOpen(true)` behind a
     "Scan Business Card" button at line 145); "Import connectMLS Export"
     switches to the MLS tab (`MlsLeadsView.tsx` already has this exact
     import feature); "Upload Records" switches to the existing `upload`
     tab; "Scrape Data" switches to Pre-Foreclosure (`PreForeclosureView.tsx`
     already has a "Scrape" action); "Look up all businesses" switches to
     MLS (already has this bulk entity-lookup action).

## D4$ Pipeline board (`src/components/driving/`)

Current stage model (from `D4dPipelineView.tsx:25-31`, this already matches
the mock's 6 columns almost exactly):

```ts
const PIPELINE_STAGES = [
  { key: 'NEW', label: 'Leads', color: '#3B82F6', num: 1 },
  { key: 'RESEARCHING', label: 'Researching', color: '#EAB308', num: 2 },
  { key: 'FOUND_OBITUARY', label: 'Found Obituary', color: '#F43F5E', num: 3 },
  { key: 'CONTACTED', label: 'Contacted', color: '#A855F7', num: 4 },
  { key: 'UNDER_CONTRACT', label: 'Under Contract', color: '#22C55E', num: 5 },
];
// plus a separate DEAD bucket: leads.filter(l => l.status === 'DEAD')
```

Add a new `src/components/driving/D4dKanbanBoard.tsx`, structured exactly
like the existing `src/crm/components/pipeline/KanbanBoard.tsx`:

- `DragDropContext` / `Droppable` (one per stage, `droppableId` = stage key,
  6 columns total: the 5 above plus `DEAD`) / `Draggable` from
  `@hello-pangea/dnd` (already a dependency — do not add `@dnd-kit`, it's
  installed but unused elsewhere and would introduce a second DnD
  convention).
- On drop: call `useUpdateDrivingLead().mutate({ id: lead.id, data: { status:
  nextStage } })` (`useUpdateDrivingLead` already exists at
  `src/hooks/useDrivingLeads.ts:34`, wraps `updateDrivingLead(id, { status })`
  from `src/lib/api.ts:1722`).
- **Card content — deviation from this spec:** the plan (Task 8) does NOT
  extract `D4dPipelineView.tsx`'s per-stage card renderers
  (`renderNewCard`/`renderResearchCard`/etc.) into a shared
  `d4dCardRenderers.tsx` as originally specified here. Discovered while
  writing the plan: those renderers are closures capturing a dozen pieces of
  local state and mutation handlers from inside `D4dPipelineView`, and safely
  extracting them would have been a much larger, riskier refactor of working
  production code than this task warranted. Instead, `D4dKanbanBoard` gets
  its own new, deliberately simpler `D4dKanbanCard` (address, city/state, a
  relative "added" time) — matching the mock's simpler Kanban card content,
  which was never as detailed as the funnel view's interactive cards anyway.
  **Net effect:** the Board and Table views now render the same lead with two
  different card designs. Accepted as a reasonable tradeoff at plan-writing
  time; unifying them later is a legitimate follow-up if it's ever wanted.
- Add a **Board / Table** toggle (simple two-button segmented control) in
  `DrivingView.tsx` that switches between the existing `D4dPipelineView`
  (renamed conceptually to "Table"/funnel view — no behavior change) and the
  new `D4dKanbanBoard` ("Board" view). The mock's "Map" third option is
  **out of scope** — no mapping library exists in this project and adding
  one is a separate project.

## Table standardization (Contacts → Eviction → MLS)

Corrected from the initial survey: Eviction's and MLS's status badges are
**already** colored pills with their own working tone-mapping functions
(`stageTone()` in Eviction, `statusTone()`/`entityLookupTone()` in MLS, both
already assigning sensible tones like `success`/`warn`/`danger`/`blue`/`grey`
per status value). Visually, badge color is not a gap versus the mock. The
real work here is:

1. **De-duplicate**, not restyle: both files' identical `PILL_BASE`/
   `PILL_TONE_CLASSES`/`pillClass()` move to `src/lib/pillBadge.ts` (see
   "Shared components" above). `stageTone()` and `statusTone()` themselves
   are untouched — same inputs, same tone strings out, same test coverage
   stays green.
2. **Icon row-actions** — Eviction currently has none (row click opens a
   detail dialog); add an `Eye` icon button per row that opens the same
   existing dialog, so both paths (click row, click icon) lead to the same
   place. MLS currently has only a text "Hide"/"Unhide" button; add an `Eye`
   icon button alongside it that opens `MlsLeadDetails` (check whether a
   click-to-open-modal path already exists there to reuse, per the earlier
   survey MLS already "opens a modal" — if so this is just adding the
   visible icon entry point, not new modal logic).
3. **Contacts gets a genuinely new Active/Inactive badge** (the one place
   that's actually missing a status pill) — derive it from whatever
   "Updated Notes" or last-interaction timestamp field `LeadsTable.tsx`
   already has (confirm the exact field during implementation; e.g. active
   = updated within the last 90 days), rendered via the same
   `pillClass('success' | 'grey')` from the new shared module.
4. **`SearchFilterBar` is optional polish**, lower priority than 1-3: wrap
   each view's search+filter row in it for container consistency, but this
   is cosmetic — skip it if it turns out each view's existing filter-row
   markup is awkward to lift into a shared shape without a larger refactor.

Pre-Foreclosure is explicitly **not** touched by this phase. It uses a third
badge convention (shadcn `Badge` + raw Tailwind colors, see
`WorkflowStageBadge.tsx`) that already renders as a colored pill by shadcn's
own default styling — nothing to change, and its 4,049-line view is out of
scope regardless.

## Calendar upcoming-events panel

Add a right-hand column (`grid lg:grid-cols-[1fr_320px] gap-4`, calendar
`lg:col-span-1` unchanged, new panel `w-[320px]`) to
`src/components/calendar/CalendarView.tsx`: a scrollable list of the next
10 upcoming (not completed, date >= now) events from the same `events`
memo the calendar already builds (`CalendarView.tsx:150`), sorted
ascending by date, each row showing date/time, title, and the same
kind-color dot the calendar events already use (`KIND_COLORS`).

## Out of scope

- Weather widget on the dashboard greeting (no weather API in this project).
- A "Map" view for the D4$ pipeline (no mapping library present).
- Moving the user profile chip out of the Sidebar footer.
- Restructuring `PreForeclosureView.tsx`'s 4,049-line table (token/badge
  styling only, via the global CSS change).
- Any new backend/API endpoints — every data source identified above already
  exists in the codebase.
