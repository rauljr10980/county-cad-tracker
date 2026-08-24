# Corporate Design Layer and Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace this app's dark teal theme with the corporate institutional design system from the Private CRM Evictions project — navy authority, muted gold for attention, greyscale everywhere else — and replace the top tab bar with a navy icon rail.

**Architecture:** This repo's Tailwind resolves every color through `hsl(var(--token))`, so redefining the tokens in `src/index.css` re-skins every existing semantic class at once without touching component color classes. What tokens cannot express — the navy rail, the Libre Franklin / IBM Plex Mono pairing, the uppercase micro-label — is added explicitly. Behavior changes nowhere.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind (HSL CSS variables), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-24-corporate-crm-port-design.md`

## Global Constraints

- Palette, verbatim from the spec. Hex on the left, the HSL triple Tailwind needs on the right:
  - ground `#eef1f4` → `210 22% 95%`
  - surface `#ffffff` → `0 0% 100%`
  - surface-alt `#f7f9fb` → `210 33% 98%`
  - line `#e0e5eb` → `212 21% 90%`
  - line-strong `#c7cfd9` → `213 19% 82%`
  - navy `#13293f` → `210 54% 16%`
  - navy-mid `#1e3d5c` → `210 51% 24%`
  - navy-soft `#35536f` → `209 35% 32%`
  - ink `#10202f` → `210 49% 12%`
  - ink-dim `#55636f` → `208 13% 38%`
  - ink-faint `#8a95a1` → `211 11% 59%`
  - gold `#9a6f1c` → `40 69% 36%`
  - gold-soft `#f0e5cd` → `41 54% 87%`
  - brick `#a8352b` → `5 59% 41%`
  - brick-soft `#f6e2e0` → `6 55% 92%`
  - mgmt `#1f6b52` → `160 55% 27%`
  - lending `#245f9e` → `211 63% 38%`
  - listing `#a4543a` → `15 48% 44%`
  - acq `#574a86` → `253 29% 41%`
- Type: **Libre Franklin** for display, **IBM Plex Mono** for record values. Both are Google Fonts; load via the existing `@import` in `src/index.css`.
- **Monospace is reserved for record values** — addresses, dates, counts, case numbers. Never for prose or labels.
- The `.label` micro-label is `0.625rem`, `0.13em` letter-spacing, uppercase, weight 600, `ink-faint`.
- The app is **light** after this change. Remove `color-scheme: dark` assumptions; do not add a dark theme.
- **No behavior changes.** Tabs, routes, data fetching, and auth all work exactly as before.
- The repo has many pre-existing TypeScript errors in unrelated files; `npx tsc --noEmit` exits non-zero on a clean checkout. Judge your work by `npm run build`, `npm test`, and a filtered tsc.
- Windows environment. Bash tool is Git Bash; PowerShell also available.
- Commit after every task.

---

### Task 1: Fonts and the corporate token layer

**Files:**
- Modify: `src/index.css` (font `@import` at line 5; `:root` token block at lines 7-60)
- Modify: `tailwind.config.ts:16-19` (fontFamily)

**Interfaces:**
- Consumes: nothing
- Produces: CSS variables `--navy`, `--navy-mid`, `--navy-soft`, `--gold`, `--gold-soft`, `--ground`, `--surface-alt`, `--line-strong`, `--ink-faint`, `--mgmt`, `--lending`, `--listing`, `--acq`, plus redefined `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`. The `.label` utility class.

- [ ] **Step 1: Swap the font import**

In `src/index.css`, replace line 5:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

with:

```css
@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
```

- [ ] **Step 2: Point Tailwind at the new families**

In `tailwind.config.ts`, replace lines 16-19:

```ts
      fontFamily: {
        sans: ['Libre Franklin', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
```

- [ ] **Step 3: Replace the `:root` token block**

In `src/index.css`, replace the entire `:root { ... }` block inside `@layer base` (starting at `--background: 222 47% 6%;`) with the block below. Keep any tokens that already exist further down the block and are not listed here — only replace the ones named.

```css
  :root {
    /* ------------------------------------------------------------------ *
     * Corporate real-estate operations.
     *
     * Light, institutional, hairline-ruled. Navy carries authority, a single
     * muted gold marks what needs attention today, and everything else is
     * greyscale so colour never competes with the data. Monospace stays
     * reserved for record values — addresses, dates, counts.
     * ------------------------------------------------------------------ */

    /* Raw palette, for the few places semantic tokens cannot express. */
    --ground:       210 22% 95%;
    --surface-alt:  210 33% 98%;
    --line-strong:  213 19% 82%;
    --navy:         210 54% 16%;
    --navy-mid:     210 51% 24%;
    --navy-soft:    209 35% 32%;
    --ink-faint:    211 11% 59%;
    --gold:          40 69% 36%;
    --gold-soft:     41 54% 87%;
    --brick:          5 59% 41%;
    --brick-soft:     6 55% 92%;

    /* Service interest, one hue each. */
    --mgmt:    160 55% 27%;
    --lending: 211 63% 38%;
    --listing:  15 48% 44%;
    --acq:     253 29% 41%;

    /* Semantic tokens — every existing Tailwind class reads through these. */
    --background:            210 22% 95%;
    --foreground:            210 49% 12%;

    --card:                    0 0% 100%;
    --card-foreground:       210 49% 12%;

    --popover:                 0 0% 100%;
    --popover-foreground:    210 49% 12%;

    --primary:               210 54% 16%;
    --primary-foreground:      0 0% 100%;

    --secondary:             210 33% 98%;
    --secondary-foreground:  210 49% 12%;

    --muted:                 210 33% 98%;
    --muted-foreground:      208 13% 38%;

    --accent:                 40 69% 36%;
    --accent-foreground:       0 0% 100%;

    --destructive:             5 59% 41%;
    --destructive-foreground:  0 0% 100%;

    --success:               160 55% 27%;
    --success-foreground:      0 0% 100%;

    --warning:                40 69% 36%;
    --warning-foreground:      0 0% 100%;

    --judgment:                5 59% 41%;
    --judgment-foreground:     0 0% 100%;

    --active:                160 55% 27%;
    --active-foreground:       0 0% 100%;

    --pending:                40 69% 36%;
    --pending-foreground:      0 0% 100%;

    --border:                212 21% 90%;
    --input:                 213 19% 82%;
    --ring:                  210 54% 16%;

    /* Institutional, not rounded. Hairlines carry the structure. */
    --radius: 0.25rem;

    --chart-1: 210 54% 16%;
    --chart-2: 160 55% 27%;
    --chart-3:  40 69% 36%;
    --chart-4:   5 59% 41%;
    --chart-5: 253 29% 41%;

    --sidebar-background: 210 54% 16%;
  }
```

- [ ] **Step 4: Set the document to light and add the micro-label**

Still in `src/index.css`, immediately after the `:root` block's closing brace, add:

```css
  html { color-scheme: light; }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
  }
```

Then, at the end of the file, add a components layer:

```css
@layer components {
  /* Micro-labels carry the institutional voice. Used for every field label. */
  .label {
    font-size: 0.625rem;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    font-weight: 600;
    color: hsl(var(--ink-faint));
  }

  /* Record values — addresses, dates, counts, case numbers. Never prose. */
  .record {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 5: Verify the build and look at it**

Run: `npm run build`
Expected: exit 0.

Then run `npm run dev`, open `http://localhost:8080`, and confirm the app is now light with navy primary buttons. It will look unfinished — that is expected, since the rail arrives in Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/index.css tailwind.config.ts
git commit -m "Replace the dark theme with the corporate token layer"
```

---

### Task 2: Extract nav items and build the navy rail

**Files:**
- Create: `src/components/layout/navItems.ts`
- Create: `src/components/layout/NavRail.tsx`
- Create: `src/components/layout/NavRail.test.tsx`
- Modify: `src/components/layout/TabNavigation.tsx` (import the shared list rather than declaring it)

**Interfaces:**
- Consumes: the token layer from Task 1
- Produces: `navItems.ts` exporting `type TabType`, `tabs`, `HIDDEN_TABS`, `visibleTabs`; `NavRail.tsx` exporting `NavRail({ activeTab, onTabChange })`

- [ ] **Step 1: Extract the nav list into its own module**

Create `src/components/layout/navItems.ts`. Move the type, list and hidden set out of `TabNavigation.tsx` verbatim so both the rail and the old bar read one source:

```ts
import { LayoutDashboard, CalendarDays, List, Home, Car, Gavel, Briefcase } from 'lucide-react';

export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'foreclosure' | 'crm' | 'evictions';

export const tabs = [
  { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Dash' },
  { id: 'calendar' as TabType, label: 'Calendar', icon: CalendarDays, shortLabel: 'Cal' },
  { id: 'properties' as TabType, label: 'Properties', icon: List, shortLabel: 'Props' },
  { id: 'preforeclosure' as TabType, label: 'Pre-Foreclosure', icon: Home, shortLabel: 'Pre-FC' },
  { id: 'foreclosure' as TabType, label: 'Foreclosure', icon: Gavel, shortLabel: 'FC' },
  { id: 'crm' as TabType, label: 'CRM', icon: Briefcase, shortLabel: 'CRM' },
  { id: 'driving' as TabType, label: 'Driving 4$', icon: Car, shortLabel: 'D4$' },
  { id: 'evictions' as TabType, label: 'Eviction List', icon: Gavel, shortLabel: 'Evict' },
];

/**
 * Tabs hidden from the nav. Empty means every tab shows.
 *
 * Hiding only removes the visual entry point — a hidden tab still renders when
 * reached by hash (e.g. #properties), so bookmarks and links keep working.
 */
export const HIDDEN_TABS = new Set<TabType>([]);

export const visibleTabs = tabs.filter((tab) => !HIDDEN_TABS.has(tab.id));
```

- [ ] **Step 2: Point the old tab bar at the shared module**

In `src/components/layout/TabNavigation.tsx`, delete the local `TabType`, `tabs`, `HIDDEN_TABS` and `visibleTabs` declarations and the now-unused `lucide-react` icon import. Add at the top:

```ts
import { visibleTabs, type TabType } from './navItems';

export type { TabType };
```

Everything else in that file stays. Re-exporting `TabType` keeps the existing imports elsewhere in the app working unchanged.

- [ ] **Step 3: Write the failing test**

Create `src/components/layout/NavRail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavRail } from './NavRail';

describe('NavRail', () => {
  it('renders every visible tab', () => {
    render(<NavRail activeTab="dashboard" onTabChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Dashboard/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Eviction List/ })).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(8);
  });

  it('marks only the active tab with aria-current', () => {
    render(<NavRail activeTab="properties" onTabChange={() => {}} />);
    const current = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-current') === 'page'
    );
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Properties');
  });

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    render(<NavRail activeTab="dashboard" onTabChange={onTabChange} />);
    screen.getByRole('button', { name: /Calendar/ }).click();
    expect(onTabChange).toHaveBeenCalledWith('calendar');
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npm test -- src/components/layout/NavRail.test.tsx`
Expected: FAIL — cannot resolve `./NavRail`.

- [ ] **Step 5: Build the rail**

Create `src/components/layout/NavRail.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { visibleTabs, type TabType } from './navItems';

/**
 * Navy rail against light content.
 *
 * The rail anchors the page and keeps the navigation target fixed while the
 * content scrolls beneath it. Its colours are literal rather than semantic:
 * it sits on navy while the rest of the app sits on paper, so the shared
 * tokens mean the wrong thing here.
 */
export function NavRail({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="flex w-[76px] shrink-0 flex-col items-center py-4"
      style={{ backgroundColor: 'hsl(var(--navy))' }}
    >
      <div className="mb-7 flex flex-col items-center">
        <span className="record text-[15px] font-medium tracking-tight text-white">360</span>
        <span className="mt-1 h-px w-7" style={{ backgroundColor: 'hsl(var(--navy-soft))' }} />
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 w-full px-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded px-1 py-2.5 transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  isActive ? 'text-white' : 'text-white/60 hover:text-white'
                )}
                style={isActive ? { backgroundColor: 'hsl(var(--navy-mid))' } : undefined}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="label text-[9px] leading-tight text-current">{tab.shortLabel}</span>
                <span className="sr-only">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npm test -- src/components/layout/NavRail.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Run the full suite and build**

Run: `npm test` — expected: all pass (24 existing + 3 new = 27).
Run: `npm run build` — expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/navItems.ts src/components/layout/NavRail.tsx src/components/layout/NavRail.test.tsx src/components/layout/TabNavigation.tsx
git commit -m "Add the navy nav rail and extract the shared nav item list"
```

---

### Task 3: Wire the rail into the shell

**Files:**
- Modify: `src/pages/Index.tsx` (the authenticated return, around line 229-232)
- Modify: `src/components/layout/Header.tsx` (header surface colours)

**Interfaces:**
- Consumes: `NavRail` from Task 2, tokens from Task 1
- Produces: the rail-based shell layout

- [ ] **Step 1: Replace the tab bar with the rail in the layout**

In `src/pages/Index.tsx`, find the authenticated return that currently reads:

```tsx
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} onTabChange={setActiveTab} onOpenEvictionsCrm={openEvictionsCrm} />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
```

Replace those lines with a rail-and-content layout:

```tsx
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <NavRail activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} onTabChange={setActiveTab} onOpenEvictionsCrm={openEvictionsCrm} />
        <div className="flex-1 overflow-y-auto">
```

The existing `<main>` and its contents stay inside that scrolling div. Close the two new wrapper divs before the closing `</div>` of the outer container — count the braces carefully, and run the build before moving on.

Add the import alongside the other layout imports:

```ts
import { NavRail } from '@/components/layout/NavRail';
```

Remove the now-unused `TabNavigation` import if nothing else in the file uses it. Keep `src/components/layout/TabNavigation.tsx` on disk — it is still the mobile fallback and is re-exporting `TabType`.

- [ ] **Step 2: Make the header sit on the light ground**

In `src/components/layout/Header.tsx`, find the outer `<header>` element and ensure its classes read:

```tsx
<header className="border-b bg-card">
```

Remove any `bg-background/95`, `backdrop-blur`, or `sticky top-0` classes on it — the rail layout scrolls the content area rather than the page, so a sticky header inside a flex column double-pins.

- [ ] **Step 3: Verify in a browser**

Run `npm run dev` and confirm, logged in:
- the navy rail runs full height on the left
- clicking each rail item switches tabs and updates the hash
- the content area scrolls under a fixed header
- the page body does not scroll horizontally

- [ ] **Step 4: Run the suite and build**

Run: `npm test` — expected: 27 passing.
Run: `npm run build` — expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx src/components/layout/Header.tsx
git commit -m "Replace the top tab bar with the navy rail"
```

---

### Task 4: Retire the competing corporate themes

**Files:**
- Delete: `src/styles/corporate.css`
- Delete: `src/crm-evictions/theme.css`
- Modify: `src/crm/views/EvictionLeadsView.tsx` (remove the `.urg` import and scope class)
- Modify: `src/crm-evictions/shell/EvictionsCrmWorkspace.tsx` (remove the `.urg-crm` import and scope class)

**Interfaces:**
- Consumes: the token layer from Task 1, which now provides the corporate look globally
- Produces: a single visual language across the app

- [ ] **Step 1: Find every reference**

Run:

```bash
grep -rn "urg" src/ --include=*.tsx --include=*.ts --include=*.css | grep -v node_modules
```

Note every file. There should be references in `EvictionLeadsView.tsx`, `EvictionsCrmWorkspace.tsx`, and the two stylesheets themselves.

- [ ] **Step 2: Remove the scope classes and imports**

In `src/crm/views/EvictionLeadsView.tsx`, delete the line `import '@/styles/corporate.css';` and remove `urg ` from the root element's className. Then remove every `urg-` prefixed class from that file's markup, replacing each with its Tailwind equivalent:

- `urg-panel` → `rounded border bg-card`
- `urg-btn` → `rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground`
- `urg-btn secondary` → `rounded border bg-card px-3 py-2 text-sm`
- `urg-input` → `h-10 w-full rounded border bg-card px-3 text-sm`
- `urg-field > span` → `label`
- `urg-table` → keep the `<table>`, drop the class
- `urg-pill` → `inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold`
- `urg-eyebrow` → `label`
- `urg-muted` → `text-muted-foreground`

In `src/crm-evictions/shell/EvictionsCrmWorkspace.tsx`, delete `import '../theme.css';` and remove `urg-crm ` from the root element's className. The CRM's own components use semantic Tailwind classes already, so they pick up the new tokens with no further edits.

- [ ] **Step 3: Delete the stylesheets**

```bash
git rm src/styles/corporate.css src/crm-evictions/theme.css
```

- [ ] **Step 4: Confirm nothing references them**

Run:

```bash
grep -rn "urg\|corporate.css\|theme.css" src/ --include=*.tsx --include=*.ts | grep -v node_modules
```

Expected: no output.

- [ ] **Step 5: Verify**

Run: `npm test` — expected: 27 passing.
Run: `npm run build` — expected: exit 0.
Run `npm run dev` and check the Eviction List tab and the Evictions CRM workspace both render on the new light corporate theme with no unstyled elements.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "Retire the two .urg themes in favour of the global token layer"
```

---

## Self-Review Notes

**Spec coverage for phase 1:** token layer (Task 1), Libre Franklin + IBM Plex Mono (Task 1), the `.label` micro-label and mono-for-record-values rule (Task 1), the 76px navy rail (Tasks 2-3), `HIDDEN_TABS` retained as the trimming mechanism (Task 2), `.urg` retirement (Task 4).

**Deliberately not in this plan:** the research module and its two bug fixes, the contact-points table, server-side parsing, the screen rebuilds, and the public-facing site. Those are phases 2-5 and get their own plans.

**Known risk, called out rather than designed away:** Task 3 restructures `Index.tsx`'s layout wrappers, and that file is large. The step says to count braces and build before moving on for exactly that reason. If the build fails there, revert the file and redo the wrapper change alone rather than debugging a half-applied edit.

**Verification honesty:** Tasks 1, 3 and 4 are largely visual and are verified in a browser, not by test. Only Task 2's rail has real unit coverage. That is the correct split — there is no useful assertion to make about a hex value being the intended hex value.
