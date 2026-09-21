# Manager "View As Teammate" — Design Spec

## Goal

Give a Manager (`ADMIN`) a single global switch that makes the whole app —
CRM, Calendar, and MLS Leads — render and save as a chosen teammate, so a
Manager can verify that per-user features actually work from inside the real
UI rather than by inspecting the database.

The Manager gets **full edit** access while switched: writes land in the
teammate's account, exactly as if that teammate had made them. The selection
**persists in `localStorage` until explicitly exited**, surviving refreshes,
new tabs, and days.

## Why this spec exists (and supersedes an earlier one)

`docs/superpowers/specs/2026-09-13-manager-normal-user-views-design.md` Part 2
described a CRM-only "view as" using a `?asUserId=` query parameter and a
per-tab picker that reset on every mount. **Part 2 of that spec was never
implemented.** Confirmed by grep: `asUserId`, `viewAsId`, and
`resolveRequestedUserId` appear only inside `docs/`, with zero occurrences in
`src/` or `functions/src/`.

Part 1 of that spec (the role dropdown) *was* implemented and is live —
`setUserRole` exists at `src/lib/api.ts:929` and is called from
`src/components/team/TeamView.tsx:107`.

This spec replaces Part 2 entirely. It differs deliberately on three axes the
user chose:

| Axis | 2026-09-13 spec (unbuilt) | This spec |
|---|---|---|
| Scope | CRM only | CRM + Calendar + MLS Leads |
| Transport | `?asUserId=` query param | `X-View-As-User` header |
| Switch UI | per-tab picker | one global top-bar switch |
| Persistence | resets every mount | `localStorage` until Exit |

A note should be added to the 2026-09-13 spec's Part 2 recording that it was
never built and is superseded by this document.

## Current state (confirmed by reading the code)

- **CRM is always scoped to the caller.** `functions/src/routes/crm.js:31`
  (`GET /state`) and `:100` (`PUT /state`) both hard-code
  `const userId = req.user.id;` and feed it to `leadWhere`/`childWhere` from
  `functions/src/lib/crmScope.js`. A Manager has no way to see a teammate's CRM.
- **Calendar is private per user, but a Manager sees everyone merged.**
  `functions/src/routes/followUps.js:25` reads
  `...(req.user.role === 'ADMIN' ? {} : { createdById: req.user.id })`. A
  Manager gets every teammate's follow-ups in one undifferentiated list, with
  no way to isolate one person.
- **MLS Leads is always scoped to the caller.** `mlsLeads.js:33` applies
  `router.use(authenticateToken)`, and the file contains **16 code occurrences**
  of `req.user.id` (lines 40, 428, 429, 455, 504, 526, 542, 552, 625, 661, 689,
  712, 721, 785, 797, 844 — plus three more in comments at 450, 621, 822).
  Every one of them is an ownership-scoping use; none of them means "who am I".
  This matters: it makes a file-wide replacement correct rather than risky.
- **`getAuthHeaders()` is a single central helper.** `src/lib/api.ts:34`, a
  plain function (not a hook) that reads `localStorage` directly via
  `getAuthToken()` at `:29`. It is imported by 16 modules, including
  `src/crm/data/dataService.ts` and `src/components/mls/MlsLeadsView.tsx:97`
  (itself a single fetch wrapper for all MLS calls). One edit here reaches
  every authenticated request the app makes.
- **CORS pins an explicit header allowlist.** `functions/src/index.js:137`:
  `allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']`. A new
  custom header **must** be added here or every request from the deployed
  GitHub Pages origin fails preflight.
- **`ActivityLog`** (`functions/prisma/schema.prisma:842`) is typed
  `CONTACT_MADE | APPOINTMENT_SET | CONTRACT_SIGNED` and relates to properties
  and driving leads. It is not a general-purpose audit log and is a poor fit for
  recording impersonated writes.
- **`AuthContext`** (`src/contexts/AuthContext.tsx:13-24`) exposes `user`,
  `logout`, `isAuthenticated`. `TopBar` already derives
  `const isAdmin = user?.role === 'ADMIN'` at `src/components/layout/TopBar.tsx:35`.
- **`AppShell`** (`src/components/layout/AppShell.tsx:19`) composes `Sidebar`,
  `TopBar`, and `<main>` — the single place a global banner can be mounted so it
  appears on every tab.

## Architecture

```
localStorage['viewAsUserId']
        │
        ├──> getAuthHeaders()  ──> X-View-As-User: <id>  ──┐
        │    (src/lib/api.ts:34)                           │
        │                                                  ▼
        └──> ViewAsContext ──> top-bar picker      resolveViewAs middleware
             (React mirror)    + global banner      (after authenticateToken)
                                                           │
                                                           ▼
                                                   req.effectiveUserId
                                                           │
                            ┌──────────────────────────────┼──────────────────┐
                            ▼                              ▼                  ▼
                        crm.js                      followUps.js         mlsLeads.js
```

`localStorage` is the single source of truth. `getAuthHeaders` is a plain
function and cannot read React context, so it reads the key directly — the same
pattern `getAuthToken` already uses. The React context exists only so the picker
and banner re-render; it never holds authoritative state.

## Part 1: Backend — pure rule + thin middleware

The decision logic and the database lookup live in **two** files, mirroring how
`functions/src/lib/crmScope.js` is already split from `functions/src/routes/crm.js`.
That file's header comment states the reason directly: a module that constructs
a `PrismaClient` at require time "eagerly loads a native query-engine binary"
and cannot be imported in the test environment. All 15 existing backend test
files sit in `functions/src/lib/`; none sits in `functions/src/middleware/`.
Putting the rule in `lib/` is what makes it testable.

### `functions/src/lib/viewAs.js` (new, dependency-free)

```js
/**
 * The rule for which account a request acts on.
 *
 * Dependency-free on purpose, exactly like crmScope.js: middleware/viewAs.js
 * constructs Prisma at require time and so cannot be imported under vitest.
 * Keeping the decision here is what makes it testable; the caller performs the
 * database existence check, which is the one part that needs I/O.
 */

const FORBIDDEN_VIEW_AS_CODE = 'FORBIDDEN_VIEW_AS';

/**
 * Returns the id of the account this request should act on.
 *
 * A caller always acts as themselves unless they explicitly ask for another
 * account via the X-View-As-User header (set by the global "viewing as"
 * switch — see src/lib/api.ts:34), which only an ADMIN may do.
 *
 * Whether the requested account exists is a database question the caller
 * answers separately.
 */
const decideEffectiveUserId = (user, rawHeader) => {
  const target = typeof rawHeader === 'string' ? rawHeader : undefined;
  if (!target || target === user.id) return user.id;

  if (user.role !== 'ADMIN') {
    const err = new Error("Only a Manager can view another account's data");
    err.code = FORBIDDEN_VIEW_AS_CODE;
    throw err;
  }

  return target;
};

module.exports = { decideEffectiveUserId, FORBIDDEN_VIEW_AS_CODE };
```

### `functions/src/middleware/viewAs.js` (new, thin)

```js
const prisma = require('../lib/prisma');
const { decideEffectiveUserId, FORBIDDEN_VIEW_AS_CODE } = require('../lib/viewAs');

/**
 * Resolves the account a request acts on. Runs AFTER authenticateToken.
 *
 * Routes opt in by reading req.effectiveUserId instead of req.user.id. Routes
 * that keep reading req.user.id are unaffected, which is what makes an
 * implicit header safe: nothing changes behavior unless it was deliberately
 * edited to.
 */
async function resolveViewAs(req, res, next) {
  try {
    const userId = decideEffectiveUserId(req.user, req.headers['x-view-as-user']);

    if (userId !== req.user.id) {
      const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: 'Team member not found' });
    }

    req.effectiveUserId = userId;
    next();
  } catch (err) {
    if (err.code === FORBIDDEN_VIEW_AS_CODE) {
      return res.status(403).json({ error: err.message });
    }
    console.error('[viewAs] resolve error:', err);
    return res.status(500).json({ error: 'Failed to resolve account' });
  }
}

module.exports = { resolveViewAs };
```

### Mounting

Only on the three opted-in routers. **Not** applied globally.

- **`functions/src/routes/mlsLeads.js:33`** — already
  `router.use(authenticateToken);`. Append a second line:
  `router.use(resolveViewAs);`
- **`functions/src/routes/crm.js`** — per-route. Insert `resolveViewAs` after
  `authenticateToken` on the two `/state` handlers only (`:29` and `:98`).
  **Do not add it to `POST /scan-corrections` (`:7`).**
- **`functions/src/routes/followUps.js`** — per-route. Insert `resolveViewAs`
  after `authenticateToken` on the four authenticated routes: `:11` (`GET /`),
  `:127` (`POST /`), `:199` (`PUT /:id`), `:236` (`DELETE /:id`).

### Scoping-site changes

**`crm.js`** — two lines:

- `:31` and `:100`: `const userId = req.user.id;` → `const userId = req.effectiveUserId;`

`crm.js:12` (`prisma.scanCorrection.create({ data: { ...data, userId: req.user.id } })`)
**stays as `req.user.id`**. A scan correction is OCR training-data attribution,
not user-scoped application data — it should record the human who actually made
the correction, not the account being inspected. This is the one place in these
three files where `req.user.id` is an identity use rather than an ownership use.

**`followUps.js`** — two lines:

- `:25`: `...(req.user.role === 'ADMIN' ? {} : { createdById: req.user.id })`
  → guarded by an explicit impersonation test:

  ```js
  const isImpersonating = req.effectiveUserId !== req.user.id;
  // ...inside the where:
  ...(req.user.role === 'ADMIN' && !isImpersonating ? {} : { createdById: req.effectiveUserId }),
  ```

  Rationale: a Manager with no teammate selected keeps today's see-everyone
  behavior (which Dashboard's monthly overview depends on). A Manager *with* a
  teammate selected must see **only** that teammate's follow-ups — otherwise the
  switch does nothing on this tab, since the unfiltered admin view already
  includes them.

  The test is `req.effectiveUserId !== req.user.id`, **not** the presence of the
  raw header. The two differ when an `ADMIN` sends the header set to their own
  id: the middleware short-circuits to self, and a header-presence test would
  wrongly narrow that Manager to only their own follow-ups. Deriving the test
  from `effectiveUserId` also keeps header parsing confined to the middleware.
  A non-admin is unaffected either way: `effectiveUserId === req.user.id`
  always holds for them.

- `:167`: `createdById: req.user.id` → `createdById: req.effectiveUserId`, so a
  follow-up created while viewing Raul appears in Raul's calendar.

`PUT /:id` (`:199`) and `DELETE /:id` (`:236`) load by id with
`prisma.followUp.findUnique({ where: { id } })` and perform **no ownership check
at all** — any authenticated user can already edit or delete any follow-up.
This is a pre-existing authorization gap, unrelated to this feature and **out of
scope**; it is recorded here so a reader doesn't mistake its absence for an
oversight in this work. `resolveViewAs` is still mounted on both so
`req.effectiveUserId` is defined consistently across the router.

**`mlsLeads.js`** — file-wide replacement of all **16 code occurrences** of
`req.user.id` with `req.effectiveUserId` (lines 40, 428, 429, 455, 504, 526,
542, 552, 625, 661, 689, 712, 721, 785, 797, 844). Every occurrence in this file
is ownership scoping, verified by reading each one; there is no identity use to
preserve. The three comment mentions (450, 621, 822) should have their wording
updated to say `req.effectiveUserId` so the comments don't drift from the code.

Note that line 40 is `POST /import`'s `const userId = req.user.id;` — after this
change, importing a workbook while viewing Raul creates leads owned by Raul.
That is correct and intended under full-edit view-as.

### CORS

`functions/src/index.js:137`:

```js
allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-View-As-User'],
```

Without this the browser blocks every request at preflight from the deployed
origin. This is a hard requirement, not a nicety.

## Part 2: Frontend — header emission

`src/lib/api.ts`, alongside the existing `getAuthToken` at `:29`:

```ts
export const VIEW_AS_STORAGE_KEY = 'viewAsUserId';

/** Reads localStorage directly, not React context: getAuthHeaders is a plain
 *  function called from non-React code paths (dataService, fetch wrappers). */
export function getViewAsUserId(): string | null {
  try {
    return localStorage.getItem(VIEW_AS_STORAGE_KEY);
  } catch {
    return null;
  }
}
```

And in `getAuthHeaders()` at `:34`, after the `Authorization` block:

```ts
  const viewAs = getViewAsUserId();
  if (viewAs) {
    headers['X-View-As-User'] = viewAs;
  }
  return headers;
```

This one edit covers all 16 modules that import `getAuthHeaders`, including the
CRM `dataService` and the MLS fetch wrapper at `MlsLeadsView.tsx:97`. No
per-module threading is required, and no existing call site changes.

## Part 3: Frontend — `ViewAsContext`

New file `src/contexts/ViewAsContext.tsx`. Mounted inside `AuthProvider` (it
depends on `user.role`).

State:

```ts
interface ViewAsContextType {
  viewAsUserId: string | null;
  viewAsUser: TeamMember | null;   // resolved from the team list, for the banner
  teamMembers: TeamMember[];       // fetched once, ADMIN only, excluding self
  setViewAs: (userId: string | null) => void;
}
```

Behavior:

- On mount, read `localStorage[VIEW_AS_STORAGE_KEY]`.
- **If the signed-in user is not `ADMIN`, clear the key and expose `null`.** This
  covers a Manager who gets demoted while a selection is stored.
- **If the stored id is the signed-in user's own id, clear it.** Guards against a
  stale self-selection.
- Fetch the team list via the existing `getUsers()` for `ADMIN` only, filtering
  out the signed-in user.
- **Clear the key on logout**, so a stored selection can never leak into the next
  session on a shared machine.

`setViewAs(id)` writes (or removes) the key and then calls
`window.location.reload()`.

### Why a full reload on switch

Switching accounts must invalidate every cached record in the app at once. The
alternative — threading a `viewAsVersion` counter into `useCrmStore`'s
`hydrate`, `useCalendarEvents`, and the MLS fetcher — means any hook missed
leaves a Manager reading one teammate's data under a banner naming another. A
reload is unconditional and cannot be partially applied.

It is also invisible in effect: the selection lives in `localStorage`, so it
survives the reload by construction.

It additionally resets `useCrmStore`'s `hydrated` gate
(`src/crm/store/useCrmStore.ts:86-93`) for free. That gate exists specifically to
stop a save from firing against a store that has not finished loading — the
comment at `:81-85` notes such a save "deletes real data with a 200". A user
switch is exactly the scenario that gate protects against, and a reload is the
most reliable way to honor it.

Consequently **`useCrmStore` and `useCalendarEvents` need no changes at all.**
`useCalendarEvents.ts:47-49` keeps calling `crmHydrate(new Date(), user?.id)`;
after a reload it simply loads whatever the header now resolves to.

## Part 4: Frontend — switch and banner

### The picker (`src/components/layout/TopBar.tsx`)

`TopBar` already computes `isAdmin` at `:35`. Render, only when `isAdmin` and
`teamMembers.length > 0`, a compact `Select` near the user menu:

- Default option: **"My account"** (value `__self__` → `setViewAs(null)`).
- One option per teammate, labeled by `username`.

No new props are threaded through `AppShell`; the component reads
`ViewAsContext` directly, as it already reads `useAuth()`.

### The banner (`src/components/layout/AppShell.tsx`)

Rendered in `AppShell` between `TopBar` and `<main>` (`:45-56`), so it appears on
every tab:

```
⚠ Viewing Raul's account as Manager — anything you change saves to Raul.  [Exit]
```

- Amber, full width, **not dismissible**. Only Exit (`setViewAs(null)`) removes it.
- Rendered only when `viewAsUserId` is set.

This banner is the primary safeguard for the full-edit + persist-until-exit
combination, and is the reason no audit log is specified (see below).

## Testing plan

- **`functions/src/lib/viewAs.test.js`** (new) — `decideEffectiveUserId`'s
  branches: no header returns self; a non-string header returns self; a header
  equal to self returns self; a non-`ADMIN` with a different target throws with
  `FORBIDDEN_VIEW_AS_CODE`; an `ADMIN` with a different target returns that
  target; and the exported code string is stable. Pure function, no Prisma,
  mirroring `functions/src/lib/crmScope.test.js` exactly.

  The middleware wrapper itself (`middleware/viewAs.js`) is **not** unit-tested:
  it imports Prisma at require time and cannot be loaded under vitest, which is
  the whole reason the rule was extracted. Its two remaining
  responsibilities — the 404 existence check and mapping
  `FORBIDDEN_VIEW_AS_CODE` to a 403 — are verified by reading, consistent with
  this repo's convention that route-level I/O is untested.
- **`src/contexts/ViewAsContext.test.tsx`** (new) — restores from `localStorage`
  on mount; clears the key for a non-`ADMIN` user; clears a stored self-id;
  clears on logout.
- **`src/lib/api.test.ts`** — `getAuthHeaders()` includes `X-View-As-User` when
  the key is set and omits it entirely when it is not.
- **`src/components/layout/TopBar.test.tsx`** (existing file) — the picker
  renders for an `ADMIN` and does not render for an `OPERATOR`, matching the
  admin-visibility cases already in that file.
- No backend route-level tests. This repo has no route test coverage for any
  existing endpoint, and this spec does not change that convention.

## Out of scope

- **Audit logging of impersonated writes.** `ActivityLog`
  (`schema.prisma:842`) is typed for property/driving-lead events and would need
  a new table. For a three-person team where the Manager is the owner, this is
  YAGNI; the non-dismissible banner is the safeguard.
- **Properties.** The untracked
  `docs/superpowers/specs/2026-09-14-private-properties-per-user-claim-design.md`
  adds a fourth private module. `resolveViewAs` extends to it in one line once
  that ships, but it is not built here.
- **The `followUps.js` `PUT`/`DELETE` ownership gap** described in Part 1.
- **Pre-Foreclosure, Driving (D4$), Evictions, Tasks, Notes.** These are shared
  team-wide today and have no per-user scoping to redirect.
- **Renaming the `UserRole` enum**, and any behavior for the unused `VIEWER`
  role — unchanged from the 2026-09-13 spec's decision.
- **Preventing a Manager from viewing another Manager's account.** Any `ADMIN`
  may view any account, including another `ADMIN`'s.
