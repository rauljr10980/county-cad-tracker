# CRM Redesign Phase 1 — Shell, Search, and Notifications

## Background

The user shared 5 reference mockups of a polished "Bexar CRE Acquisition CRM"
visual design and asked for the app to be redesigned to match. The full
redesign spans the whole app (Dashboard, Contacts, Pre-Foreclosure, MLS
Leads, a new D4$ Kanban board) and was explicitly decomposed into phases,
each with its own design/spec/plan/implementation cycle. This spec covers
**Phase 1 only**: the navigation shell (sidebar + top bar), a real
cross-domain search, a real (infra-free) notifications feed, and the
design-token changes the shell needs. Later phases restyle each page's own
content and build the D4$ Kanban board; none of that is in scope here.

The user approved this phase's direction (AppShell architecture; real
search wired across Properties/CRM/MLS/Pre-Foreclosure; real notifications
sourced from existing data with no new backend infrastructure; folding in
the earlier "move mobile nav to a dropdown" request; adopting the mockup's
branding copy) and then said they were going to sleep and asked for this to
be built autonomously. **The "user reviews the written spec" gate that the
brainstorming process normally requires next is explicitly skipped here**,
per that instruction — there is no one available to review it before
implementation starts. Treat this document as the binding design; deviate
from it only where it is genuinely wrong (e.g. a field name that doesn't
match reality), and note any such deviation in the final report.

## Goals

1. Replace `NavRail.tsx` + `Header.tsx` with a single cohesive `AppShell`
   (a `Sidebar` + a `TopBar`), matching the mockup's visual language.
2. A real, working cross-domain search (Properties, Pre-Foreclosure, CRM
   Contacts, MLS Leads), reachable via a top-bar search box.
3. A real, working notifications feed (follow-ups due, new inbox
   submissions) with no new database tables and no read/unread state.
4. Mobile: the sidebar disappears entirely; a hamburger button in the top
   bar opens a sheet containing tab navigation (this is the "move mobile
   nav to a dropdown" work from earlier in the session, folded into this
   phase).
5. Adopt the mockup's branding copy in the sidebar header: "Bexar CRE
   Acquisition CRM" / "San Antonio, TX".
6. "Settings" (the existing ADMIN-only manager view — hide/unhide tabs,
   invite link) becomes a real sidebar nav entry, ADMIN-only, instead of a
   header gear icon — matching the mockup, which lists Settings as a nav
   item.
7. A small reusable avatar-initials circle primitive, for the sidebar's
   user footer (this phase) and later phases' contact tables. (A pill/badge
   tone helper was considered here too, but deferred — see "Pill — deferred
   out of this phase" below; nothing in this phase's own UI ended up needing
   one.)
8. One global design-token change: soften `--radius` app-wide so buttons,
   inputs, and cards on every page (including ones not yet redesigned)
   immediately look less "sharp/institutional" and more like the mockup.

## Non-goals (explicitly out of scope for this phase)

- Restyling the *content* of Dashboard, Contacts, Pre-Foreclosure, MLS
  Leads, or Driving. They keep their current look and sit inside the new
  shell. This is an expected, accepted transitional state — not a bug.
- The D4$ Kanban board (its own later phase; no Kanban/drag-and-drop work
  happens here).
- Per-user data isolation for Property, PreForeclosure, FollowUp, or
  Driving records. That is a separate, already-known pending epic from
  earlier in this session. Notifications and search here match *today's*
  actual scoping (Property/PreForeclosure/FollowUp are shared/team-wide;
  CrmLead/MlsLead are already scoped to `userId`) rather than inventing new
  isolation rules.
- Any persisted "read" state for notifications. The feed is recomputed
  live on every request from data that already exists.
- The weather widget / daily quote from the Dashboard mockup — that belongs
  to Dashboard's own phase.
- Deep-linking a search result to a specific record's detail modal. See
  "Search result click behavior" below for the actual (still real, but
  smaller-blast-radius) behavior chosen instead.

## Design tokens

**File:** `src/index.css`

Change the single `--radius` custom property from `0.25rem` to `0.625rem`.
This is a one-line change. Every shadcn `Button`/`Input`/`Card`/`Dialog`/etc.
across the *entire* app derives its corner radius from this token via
`tailwind.config.ts`'s `borderRadius` block (`lg: 'var(--radius)'`, etc.) —
so this one line immediately softens every page's controls, not just the
new shell, with zero markup changes anywhere else. Do not change any other
existing token in this file (colors, `--navy*`, `--sidebar-*`, etc.) — the
sidebar's navy palette already matches the mockup's dark rail and needs no
adjustment, only more surface area (a wider sidebar) to read correctly.

## New shared primitives

### Pill — deferred out of this phase

The original draft of this spec included a generic `src/components/ui/pill.tsx`
status-pill component here, reasoned as useful for "later phases and this
phase's notification/search UI." Writing the implementation plan surfaced
that nothing in this phase's actual UI (Sidebar, TopBar, GlobalSearchDialog)
renders a status pill — search results and notifications ended up as plain
text. Building it now with no real caller would be a speculative
abstraction this codebase's own conventions warn against (see the app's
"don't add abstractions beyond what the task requires" norm). **Cut from
this phase.** A later phase that actually has status pills to render
(Contacts' Warm/Active/Cold is the most likely first real caller) should add
it then, generalizing `MlsLeadsView.tsx`'s existing `pillClass`/
`PILL_TONE_CLASSES` pattern the way this section originally described — that
reasoning still holds, it's just premature here.

### `src/components/ui/avatar-initials.tsx` (new)

A colored circle with up to 2 initials, for the top bar's user menu (this
phase) and later phases' contact tables.

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

Both are pure/presentational — no store or API dependency — so both should
have a `.test.tsx` covering: `initialsForName`/`colorForName` behavior
(single word, multi word, empty string) is exercised indirectly through
rendered output (`getByText`), and `colorForName` is deterministic (same
name → same color across two renders).

## AppShell architecture

Three new files replace two old ones:

- **New:** `src/components/layout/AppShell.tsx`
- **New:** `src/components/layout/Sidebar.tsx` (replaces `NavRail.tsx`)
- **New:** `src/components/layout/TopBar.tsx` (replaces `Header.tsx`)
- **Delete:** `src/components/layout/NavRail.tsx`, `src/components/layout/NavRail.test.tsx`, `src/components/layout/Header.tsx`
- **New:** `src/components/layout/Sidebar.test.tsx` (migrates `NavRail.test.tsx`'s assertions)
- **Modified:** `src/pages/Index.tsx` — renders `<AppShell>` instead of manually composing `NavRail` + `Header` + `<main>`

`navItems.ts` (tabs, `manageableNavItems`, `getVisibleTabs`,
`isPublicSiteVisible`, `PUBLIC_SITE_URL`, `externalNavItem`) is **unchanged**
— both `Sidebar` and the mobile sheet consume it exactly as `NavRail` does
today.

### `AppShell.tsx`

```tsx
interface AppShellProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onHiddenTabsSaved: (ids: Set<string>) => void
  onRefresh: () => void
  isRefreshing: boolean
  children: React.ReactNode
}
```

Renders:

```tsx
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
    />
    <div className="flex-1 overflow-y-auto">
      <main className="container mx-auto animate-fade-in overflow-x-hidden">{children}</main>
    </div>
  </div>
</div>
```

This is a direct extraction of `Index.tsx`'s current authenticated-branch
JSX (see `src/pages/Index.tsx`'s final `return`), so `Index.tsx`'s only
change here is replacing that block with `<AppShell ...>{renderContent()}</AppShell>`
and dropping its now-unused `NavRail`/`Header` imports (it keeps
`hiddenTabIds`/`setHiddenTabIds` state and the `getHiddenTabs()` effect —
those are unchanged, just now threaded into `AppShell` instead of directly
into `NavRail`/`Header`).

`TopBar` needs `hiddenTabIds`/`onHiddenTabsSaved` too because its mobile
sheet renders tab navigation (see below) using the same visibility rules as
`Sidebar`.

### `Sidebar.tsx`

Desktop-only (`hidden md:flex`), replaces the old 76px icon rail. Layout,
top to bottom:

1. **Brand header** (fixed): a building icon, then two lines of text —
   `"Bexar CRE Acquisition CRM"` (bold) and `"San Antonio, TX"` (muted,
   smaller). This replaces the old rail's tiny "360" mark.
2. **Nav list**: `getVisibleTabs(hiddenTabIds).map(...)` — same data source
   as today, but each item renders icon + full `label` (not `shortLabel`)
   side by side horizontally, full width, with the same
   `aria-current="page"` / active-background behavior `NavRail` has today.
3. **Public Website link**: same as today (`isPublicSiteVisible`,
   `externalNavItem`, opens in a new tab) — keep as the last item in the
   nav list.
4. **Settings item** (new): rendered only when `user.role === 'ADMIN'`
   (from `useAuth()`), same visual treatment as a nav item (Settings icon +
   "Settings" label), but `onClick` opens `ManagerViewDialog` instead of
   calling `onTabChange` — pass `onHiddenTabsSaved` straight through to it,
   same contract `Header.tsx` uses today.
5. **User footer** (fixed to the bottom, `mt-auto`): `AvatarInitials` sized
   ~32px + `user.username` + a small role label (map `ADMIN` → "Manager",
   `OPERATOR` → "Team Member", `VIEWER` → "Viewer") + a chevron icon. Wrap
   this in the same `DropdownMenu` content `Header.tsx` renders today for
   desktop (Logout at minimum — carry over whatever else was in that menu:
   the user block itself, then a separator, then Logout).

Width: `w-64` (256px) is a reasonable match for the mockup's proportions;
use Tailwind's `w-64` rather than a literal pixel style (the old rail used
an inline style for its 76px width — prefer the Tailwind class here since
there's no navy-token reason to inline it).

Colors: keep using the existing `hsl(var(--navy))` /
`hsl(var(--navy-mid))` / `hsl(var(--navy-soft))` tokens exactly as
`NavRail.tsx` does today — no new color tokens needed for the sidebar.

### `TopBar.tsx`

Desktop: a horizontal bar (matches `Header.tsx`'s current `<header>`
height/border/background) containing, left to right:

1. **Search box**: a styled, non-functional-looking-but-real trigger — an
   `<input readOnly>` (or a `<button>` styled like an input) with
   placeholder text `"Search contacts, addresses, opportunities, or
   anything..."` and a `⌘K` hint pill on its right edge. Clicking it (or a
   global `mod+k` keydown listener) opens `GlobalSearchDialog` (new, see
   below).
2. **Refresh button**: same `onRefresh`/`isRefreshing` prop and spinning
   `RefreshCw` icon `Header.tsx` has today.
3. **Notification bell**: a button with a `Bell` icon; a small red dot
   badge appears when `count > 0` (see Notifications section). Clicking it
   opens a `Popover` (or `DropdownMenu`) listing up to 10 items from
   `GET /api/notifications`, each clickable to `onTabChange(item.tab)` and
   close the popover. Fetch on mount, refetch when the popover opens, and
   poll every 2 minutes while mounted (`setInterval`, cleared on unmount) —
   no websocket, no new infra.
4. **User avatar** (desktop only — the sidebar's footer already covers the
   primary user menu, so this can be a smaller redundant convenience, OR
   simply omitted on desktop since `Sidebar`'s footer already has it. Omit
   it on desktop to avoid two identical user menus fighting for attention;
   keep the account Sheet trigger for mobile only, see below).

Mobile (`md:hidden`): search box, refresh, and bell stay (all three are
useful on mobile too, and none is desktop-only functionally) plus a
hamburger `Menu`/`X` toggle button that opens a `Sheet` (same shadcn
`Sheet` component `Header.tsx` uses today) containing, top to bottom:

1. **Tab navigation**: `getVisibleTabs(hiddenTabIds).map(...)` rendered as
   full-width buttons (icon + label), `onClick` calls `onTabChange(tab.id)`
   then closes the sheet. This is the actual "nav moved to a mobile
   dropdown" behavior.
2. A divider.
3. **Account actions**: carry over `Header.tsx`'s existing mobile sheet
   content verbatim — user block (username/email), Upload, Files, (ADMIN
   only) "Manager Settings" opening `ManagerViewDialog`, Logout.

Drop entirely (do not carry forward into `TopBar.tsx`): `Header.tsx`'s
unauthenticated-branch JSX (`LoginModal`/`SignupModal` rendering, the
`isAuthenticated ? ... : ...` ternaries) — confirmed dead code, since
`Header`/`TopBar` only ever mounts from `Index.tsx`'s authenticated return
branch. `TopBar` can assume `isAuthenticated` is always true and drop the
`isAuthenticated` check, the `LoginModal`/`SignupModal` imports, and the
`isLoginOpen`/`isSignupOpen` state entirely.

## Search feature

### Backend

**New file:** `functions/src/lib/searchResults.js` — pure, dependency-free
mapping/formatting helpers (testable; mirrors the existing convention in
`functions/src/lib/crmScope.js`, whose header explains why: route files
construct a `PrismaClient` at require time and can't be imported in the
test environment, so logic worth testing lives in a plain module the route
just calls).

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

**New file:** `functions/src/routes/search.js`

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

// Property and PreForeclosure are shared/team-wide today (see the
// data-isolation epic noted in this phase's spec — not scoped to userId
// yet). CrmLead and MlsLead already are. This matches, not invents, the
// app's current per-model scoping.
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

Mount in `functions/src/index.js`: `app.use('/api/search', searchRoutes);`
(add the `require` alongside the other route imports, add the `app.use`
line alongside the others — same pattern as every existing route).

No new Prisma model, no migration, no `db push` needed for this endpoint.

### Frontend

**New file:** `src/lib/pendingSearch.ts` — a tiny sessionStorage-backed
signal so a search result click can seed the *destination view's own
existing search box* without this phase needing to wire a "open this exact
record's detail modal" integration into four large, heterogeneous views
(Properties, Pre-Foreclosure, CRM, MLS Leads each already have their own
text-search state — reuse it, don't replace it).

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

`.test.ts`: set-then-consume returns the value; consuming clears it (a
second consume returns `null`); consuming a tab that was never set returns
`null`; two different tabs don't collide.

**New file:** `src/lib/api.ts` addition —

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
```

**New file:** `src/components/layout/GlobalSearchDialog.tsx` — built on the
existing (currently unused) `src/components/ui/command.tsx` primitives
(`CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`,
`CommandItem`). Props: `{ open: boolean; onOpenChange: (open: boolean) => void; onNavigate: (tab: TabType) => void }`.

- Debounce the `CommandInput`'s value (300ms) and call `searchAll(query)`
  when it's 2+ characters; clear results otherwise.
- Group results by `type` into up to 4 `CommandGroup`s ("Properties",
  "Pre-Foreclosure", "Contacts", "MLS Leads"), each `CommandItem` showing
  `label` / `sublabel`.
- **Search result click behavior**: selecting an item calls
  `setPendingSearch(result.tab, result.label)`, then `onNavigate(result.tab
  as TabType)`, then closes the dialog. This switches the user to the
  right section and seeds that section's own search box with the matched
  label — a real, working "jump to it," without this phase needing to
  understand or modify each target view's internal record-detail-opening
  logic.
- Wire `⌘K`/`Ctrl+K` globally: `AppShell` (not `TopBar` alone, so it works
  regardless of which part of the shell has focus) adds a `keydown`
  listener for `(e.metaKey || e.ctrlKey) && e.key === 'k'`,
  `e.preventDefault()`, opens the dialog. Clean up on unmount. Follow the
  existing `Shift+P` phone-search shortcut in `Index.tsx` as the reference
  pattern for how a global shortcut is wired and cleaned up (`useEffect`
  with an `addEventListener`/`removeEventListener` pair) — but unlike that
  handler, do **not** add an input-focus exclusion: `Shift+P` excludes
  focused inputs because a bare letter is easy to fat-finger while typing;
  `⌘/Ctrl+K` already requires a modifier key, so it can't collide with
  normal typing and should fire regardless of what has focus.

**Modified files (small, additive only):** each of the following gets its
*existing* search-text `useState` initializer changed to check
`consumePendingSearch('<own-tab-id>')` once, falling back to its current
default (usually `''`) — no other change to these files:

- `src/components/properties/PropertiesView.tsx` (tab id `'properties'`) —
  confirmed local state at line 363: `const [searchQuery, setSearchQuery] =
  useState('');`. Change the initializer to
  `useState(() => consumePendingSearch('properties') ?? '')`.
- `src/components/preforeclosure/PreForeclosureView.tsx` (tab id
  `'preforeclosure'`) — confirmed local state at line 245, same shape:
  `const [searchQuery, setSearchQuery] = useState('');`. Same change,
  `consumePendingSearch('preforeclosure')`.
- `src/components/mls/MlsLeadsView.tsx` (tab id `'mls'`) — confirmed local
  state at line 177: `const [search, setSearch] = useState('');`. Same
  change, `consumePendingSearch('mls')`.
- `src/crm/views/ContactsView.tsx` (tab id `'crm'`) — CRM's search text is
  a global zustand store, not local state: `src/crm/lib/searchStore.ts`
  exports `useSearchStore` with `{ query: string; setQuery(query: string):
  void }`. Rather than touching `ContactsView.tsx` itself, add a one-line
  `useEffect` in `CrmView.tsx` (the CRM tab's shell, which already mounts
  once per tab visit) that runs once on mount:
  `useSearchStore.getState().setQuery(consumePendingSearch('crm') ?? '')`.

All four confirmed by reading the actual files while writing this spec —
no further discovery needed at implementation time.

## Notifications feature

### Backend

**New file:** `functions/src/lib/notificationFeed.js` — pure mapping/
sorting helpers (same testability reasoning as `searchResults.js`).

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

**New file:** `functions/src/routes/notifications.js`

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

Mount in `functions/src/index.js`: `app.use('/api/notifications', notificationsRoutes);`.
No new Prisma model, no migration.

`DrivingLead` has no plain `address` column — it stores `rawAddress`/
`street`/`city`/`state`/`zip` separately (confirmed by reading its schema
block), which is why `mapFollowUpNotification` above reads
`f.drivingLead?.rawAddress`, not `.address`.

### Frontend

**New file:** `src/lib/api.ts` addition —

```ts
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
```

`TopBar.tsx`'s bell button (see above) consumes this — fetch on mount,
refetch on open, poll every 2 minutes.

## Error handling

- `GlobalSearchDialog`: a failed `searchAll` call shows a small inline
  "Search failed, try again" message inside the dialog rather than a toast
  (the dialog is already the focused surface) and does not close the
  dialog.
- Notification bell: a failed `getNotifications` call leaves the badge
  showing its last-known count (don't flash it to zero) and the popover
  shows "Couldn't load notifications" instead of an empty list, so a
  transient failure doesn't look like "you have nothing due."
- Both follow the existing codebase convention of catching fetch errors at
  the call site and rendering a message rather than throwing past the
  component (see `ManagerViewDialog.tsx`'s `getHiddenTabs()`/`getInviteLink()`
  handling for the pattern to match).

## Testing

- `src/components/layout/Sidebar.test.tsx` — migrates `NavRail.test.tsx`'s
  5 existing assertions (renders every tab when nothing hidden, hides
  tabs named in hiddenTabIds, marks only the active tab with aria-current,
  calls onTabChange, renders/hides the Public Website link) onto `Sidebar`,
  plus two new ones: the Settings item renders when `user.role === 'ADMIN'`
  and does not render for `OPERATOR`/`VIEWER` (mock `useAuth`).
- `src/components/ui/avatar-initials.test.tsx` — single-word name → 2-char
  initials from that word; multi-word name → first+last initials; same
  name renders the same background color across two separate renders.
- `src/lib/pendingSearch.test.ts` — as described above.
- `functions/src/lib/searchResults.test.js` — `isQueryTooShort` boundary
  cases (empty, 1 char, 2 chars, whitespace-only, non-string/undefined);
  each `map*Result` function produces the exact shape described above from
  a representative fake row.
- `functions/src/lib/notificationFeed.test.js` — `mapFollowUpNotification`
  picks the right `tab`/`message` for each of the three polymorphic
  relations being set; `sortByTimestampDesc` orders correctly and doesn't
  mutate its input array.
- Route files (`search.js`, `notifications.js`) are not unit-tested
  directly, matching this codebase's established convention (see
  `crmScope.js`'s file-header comment) — their logic lives in the `lib/`
  files above, which are.

## Deployment

No schema/migration changes (no new Prisma models, no new columns) — the
backend deploy is a plain `railway up --service county-cad-tracker --ci`
once tests pass. Frontend deploys via the existing GitHub Actions workflow
on push to `main`. No feature flag — this ships directly, like every other
change in this session. Run the full test suite, `tsc --noEmit`, and
`npm run build` before committing, matching this session's established
pattern.
