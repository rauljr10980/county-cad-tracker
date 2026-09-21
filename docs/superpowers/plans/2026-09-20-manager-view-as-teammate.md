# Manager "View As Teammate" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Manager (`ADMIN`) one global switch that makes CRM, Calendar, and MLS Leads render and save as a chosen teammate, so per-user features can be verified from inside the real UI.

**Architecture:** `localStorage['viewAsUserId']` is the single source of truth. `getAuthHeaders()` reads it directly and attaches an `X-View-As-User` header to every authenticated request. A `resolveViewAs` middleware, mounted only on the three opted-in routers, validates the header and sets `req.effectiveUserId`; those routes read `req.effectiveUserId` instead of `req.user.id`. Every other route keeps `req.user.id` and is unaffected. Switching accounts triggers a full page reload so no stale data can survive the switch.

**Tech Stack:** Express + Prisma (backend, CommonJS), React 18 + TypeScript + Zustand + shadcn/ui (frontend), Vitest + @testing-library/react for both. Backend tests run from the repo root — `vite.config.ts:33` includes `functions/src/**/*.test.js`.

**Spec:** `docs/superpowers/specs/2026-09-20-manager-view-as-teammate-design.md`

## Global Constraints

- **Header name is exactly `X-View-As-User`.** Express lowercases incoming headers, so backend code reads `req.headers['x-view-as-user']`.
- **localStorage key is exactly `viewAsUserId`**, exported as `VIEW_AS_STORAGE_KEY` from `src/lib/api.ts`.
- **`req.effectiveUserId` is opt-in.** Only `crm.js`, `followups.js`, and `mlsLeads.js` may read it. Never add `resolveViewAs` globally in `functions/src/index.js`.
- **`crm.js:12` (`scanCorrection`) keeps `req.user.id`.** It is OCR training-data attribution — an identity use, not an ownership use.
- **Backend test files live in `functions/src/lib/` only.** Anything importing `../lib/prisma` constructs a `PrismaClient` at require time, which eagerly loads a native query-engine binary and cannot be imported under vitest.
- **Run all tests from the repo root** with `npm test` (`vitest run`). There is no test script in `functions/package.json`.
- **Backend is CommonJS** (`require`/`module.exports`); test files use ESM `import` and vitest handles the interop — see `functions/src/lib/crmScope.test.js:1-10`.
- **Manager-facing copy uses "Manager", not "ADMIN".** The enum stays `ADMIN`; only display labels say Manager.

---

### Task 1: The view-as rule (pure, dependency-free)

**Files:**
- Create: `functions/src/lib/viewAs.js`
- Test: `functions/src/lib/viewAs.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `decideEffectiveUserId(user, rawHeader) -> string` where `user` is `{ id: string, role: 'ADMIN'|'OPERATOR'|'VIEWER' }` and `rawHeader` is `string | undefined`. Throws `Error` with `.code === FORBIDDEN_VIEW_AS_CODE`. Also exports `FORBIDDEN_VIEW_AS_CODE = 'FORBIDDEN_VIEW_AS'`. Task 2 consumes both.

- [ ] **Step 1: Write the failing test**

Create `functions/src/lib/viewAs.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { decideEffectiveUserId, FORBIDDEN_VIEW_AS_CODE } from './viewAs.js';

const admin = { id: 'mgr1', role: 'ADMIN' };
const operator = { id: 'op1', role: 'OPERATOR' };

describe('decideEffectiveUserId', () => {
  it('acts as the caller when no header is sent', () => {
    expect(decideEffectiveUserId(admin, undefined)).toBe('mgr1');
    expect(decideEffectiveUserId(operator, undefined)).toBe('op1');
  });

  it('acts as the caller when the header names the caller', () => {
    expect(decideEffectiveUserId(admin, 'mgr1')).toBe('mgr1');
  });

  it('ignores a non-string header rather than trusting it', () => {
    expect(decideEffectiveUserId(admin, ['a', 'b'])).toBe('mgr1');
    expect(decideEffectiveUserId(admin, '')).toBe('mgr1');
  });

  it('lets a Manager act as another account', () => {
    expect(decideEffectiveUserId(admin, 'op1')).toBe('op1');
  });

  it('refuses a non-Manager asking for another account', () => {
    expect(() => decideEffectiveUserId(operator, 'mgr1')).toThrowError(
      /only a manager/i
    );
  });

  it('tags the refusal with a stable code the middleware maps to 403', () => {
    try {
      decideEffectiveUserId(operator, 'mgr1');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe(FORBIDDEN_VIEW_AS_CODE);
    }
  });

  it('exposes a stable code string', () => {
    expect(FORBIDDEN_VIEW_AS_CODE).toBe('FORBIDDEN_VIEW_AS');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- functions/src/lib/viewAs.test.js`
Expected: FAIL — cannot resolve `./viewAs.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/src/lib/viewAs.js`:

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
 * switch — see src/lib/api.ts), which only an ADMIN may do.
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- functions/src/lib/viewAs.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/viewAs.js functions/src/lib/viewAs.test.js
git commit -m "feat: add the view-as rule for Manager account switching"
```

---

### Task 2: The middleware and CORS header allowance

**Files:**
- Create: `functions/src/middleware/viewAs.js`
- Modify: `functions/src/index.js:138` (the `allowedHeaders` array)

**Interfaces:**
- Consumes: `decideEffectiveUserId`, `FORBIDDEN_VIEW_AS_CODE` from Task 1.
- Produces: `resolveViewAs(req, res, next)` — an Express middleware that sets `req.effectiveUserId`. Tasks 3, 4, and 5 mount it.

No unit test. This file imports `../lib/prisma`, which constructs a `PrismaClient` at require time and cannot load under vitest — that is precisely why Task 1 extracted the rule. Its two remaining responsibilities (the 404 existence check, and mapping the error code to a 403) are verified by reading, consistent with this repo having no route-level test coverage for any endpoint.

- [ ] **Step 1: Write the middleware**

Create `functions/src/middleware/viewAs.js`:

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
      const exists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
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

- [ ] **Step 2: Allow the header through CORS**

In `functions/src/index.js`, find line 138:

```js
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
```

Replace with:

```js
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-View-As-User'],
```

This is mandatory, not cosmetic: without it the browser rejects every request at preflight from the deployed GitHub Pages origin, and the failure looks like a generic network error rather than anything naming the header.

- [ ] **Step 3: Verify the backend still boots**

Run: `node -e "require('./functions/src/middleware/viewAs.js'); console.log('middleware loads')"`
Expected: prints `middleware loads` with no Prisma or syntax error.

- [ ] **Step 4: Verify the full suite is still green**

Run: `npm test`
Expected: PASS — no existing test should change behavior, since nothing mounts the middleware yet.

- [ ] **Step 5: Commit**

```bash
git add functions/src/middleware/viewAs.js functions/src/index.js
git commit -m "feat: add resolveViewAs middleware and allow its header through CORS"
```

---

### Task 3: Frontend emits the header

**Files:**
- Modify: `src/lib/api.ts:28-43` (the auth-header helpers)
- Test: `src/lib/api.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `VIEW_AS_STORAGE_KEY = 'viewAsUserId'` and `getViewAsUserId(): string | null`, both exported from `src/lib/api.ts`. Task 6 imports both. `getAuthHeaders()` keeps its existing signature and gains the header.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getAuthHeaders, getViewAsUserId, VIEW_AS_STORAGE_KEY } from './api';

afterEach(() => {
  localStorage.clear();
});

describe('getViewAsUserId', () => {
  it('returns null when nothing is stored', () => {
    expect(getViewAsUserId()).toBeNull();
  });

  it('returns the stored id', () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1');
    expect(getViewAsUserId()).toBe('teammate-1');
  });
});

describe('getAuthHeaders', () => {
  it('omits the view-as header entirely when no teammate is selected', () => {
    localStorage.setItem('authToken', 't0ken');
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t0ken');
    expect('X-View-As-User' in headers).toBe(false);
  });

  it('attaches the view-as header when a teammate is selected', () => {
    localStorage.setItem('authToken', 't0ken');
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1');
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers['X-View-As-User']).toBe('teammate-1');
  });

  it('still attaches the view-as header when there is no auth token', () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1');
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers['X-View-As-User']).toBe('teammate-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/api.test.ts`
Expected: FAIL — `getViewAsUserId` and `VIEW_AS_STORAGE_KEY` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/api.ts`, replace the block at lines 28-43:

```ts
// Helper function to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

// Helper function to get headers with auth
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
```

with:

```ts
// Helper function to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

/** The teammate a Manager is currently viewing as, or null for their own account. */
export const VIEW_AS_STORAGE_KEY = 'viewAsUserId';

/**
 * Read straight from localStorage rather than React context: getAuthHeaders is
 * a plain function called from non-React code paths (the CRM dataService, the
 * MLS fetch wrapper), so it cannot use a hook. localStorage is therefore the
 * single source of truth; ViewAsContext only mirrors it for rendering.
 */
export function getViewAsUserId(): string | null {
  try {
    return localStorage.getItem(VIEW_AS_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Helper function to get headers with auth
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // One edit here reaches all 16 modules that import getAuthHeaders. The
  // backend ignores this header except on the three opted-in routers.
  const viewAs = getViewAsUserId();
  if (viewAs) {
    headers['X-View-As-User'] = viewAs;
  }
  return headers;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/api.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat: send X-View-As-User on every authenticated request"
```

---

### Task 4: Scope the CRM to the effective user

**Files:**
- Modify: `functions/src/routes/crm.js:29`, `:31`, `:98`, `:100`

**Interfaces:**
- Consumes: `resolveViewAs` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Import the middleware**

In `functions/src/routes/crm.js`, after the existing auth import on line 4:

```js
const { authenticateToken } = require('../middleware/auth');
```

add:

```js
const { resolveViewAs } = require('../middleware/viewAs');
```

- [ ] **Step 2: Mount it on the two `/state` handlers only**

Line 29 — change:

```js
router.get('/state', authenticateToken, async (req, res) => {
```

to:

```js
router.get('/state', authenticateToken, resolveViewAs, async (req, res) => {
```

Line 98 — change:

```js
router.put('/state', authenticateToken, async (req, res) => {
```

to:

```js
router.put('/state', authenticateToken, resolveViewAs, async (req, res) => {
```

**Do NOT add it to `router.post('/scan-corrections', ...)` on line 7.**

- [ ] **Step 3: Read the effective user at the two scoping sites**

Line 31 (inside `GET /state`'s try block) — change:

```js
    const userId = req.user.id;
```

to:

```js
    const userId = req.effectiveUserId;
```

Line 100 (inside `PUT /state`, above its try block) — make the same change:

```js
  const userId = req.effectiveUserId;
```

- [ ] **Step 4: Verify `scan-corrections` was left alone**

Run: `grep -n "req.user.id\|req.effectiveUserId" functions/src/routes/crm.js`
Expected: exactly three lines — line 12 still `req.user.id` (the `scanCorrection` create), and lines 31 and 100 now `req.effectiveUserId`.

A scan correction records the human who actually corrected the OCR, not the account being inspected. It is the only identity use of `req.user.id` in these three route files; every other occurrence is ownership.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add functions/src/routes/crm.js
git commit -m "feat: scope CRM state to the effective user"
```

---

### Task 5: Scope the Calendar to the effective user

**Files:**
- Modify: `functions/src/routes/followups.js:11`, `:25`, `:127`, `:167`, `:199`, `:236`

**Interfaces:**
- Consumes: `resolveViewAs` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Import the middleware**

In `functions/src/routes/followups.js`, after line 3:

```js
const { authenticateToken, optionalAuth } = require('../middleware/auth');
```

add:

```js
const { resolveViewAs } = require('../middleware/viewAs');
```

- [ ] **Step 2: Mount it on the four authenticated routes**

Add `resolveViewAs` after `authenticateToken` on lines 11, 127, 199, and 236:

```js
router.get('/', authenticateToken, resolveViewAs, async (req, res) => {
router.post('/', authenticateToken, resolveViewAs, async (req, res) => {
router.put('/:id', authenticateToken, resolveViewAs, async (req, res) => {
router.delete('/:id', authenticateToken, resolveViewAs, async (req, res) => {
```

**Leave the two `optionalAuth` routes unchanged** — `GET /d4d` (line 83) and `GET /by-property/:propertyId` (line 104). They have no guaranteed caller to resolve and serve shared data.

- [ ] **Step 3: Narrow the Manager's month query when impersonating**

In `GET /` (line 11), add this line at the top of the try block, just after `const { month } = req.query;`:

```js
    const isImpersonating = req.effectiveUserId !== req.user.id;
```

Then change line 25:

```js
        ...(req.user.role === 'ADMIN' ? {} : { createdById: req.user.id }),
```

to:

```js
        // A Manager with nobody selected keeps seeing everyone (Dashboard's
        // monthly overview depends on it). A Manager viewing one teammate must
        // see only that teammate, or the switch would do nothing here — the
        // unfiltered admin view already includes them.
        ...(req.user.role === 'ADMIN' && !isImpersonating ? {} : { createdById: req.effectiveUserId }),
```

The test is `req.effectiveUserId !== req.user.id`, **not** whether the header is present. The two differ when an `ADMIN` sends the header naming their own id: the rule short-circuits to self, and a header-presence test would wrongly narrow that Manager to only their own follow-ups.

- [ ] **Step 4: Create follow-ups under the effective user**

Line 167 — change:

```js
        createdById: req.user.id,
```

to:

```js
        createdById: req.effectiveUserId,
```

So a follow-up created while viewing Raul appears in Raul's calendar, which is the point of full-edit view-as.

`PUT /:id` and `DELETE /:id` need no further change. They load by id with `prisma.followUp.findUnique({ where: { id } })` and perform **no ownership check at all** — any authenticated user can already edit or delete any follow-up. That is a pre-existing authorization gap, out of scope for this work, recorded here so its absence is not mistaken for an oversight. The middleware is still mounted on both so `req.effectiveUserId` is defined consistently across the router.

- [ ] **Step 5: Verify and commit**

Run: `grep -n "req.user.id\|req.user.role\|req.effectiveUserId" functions/src/routes/followups.js`
Expected: line 25's ternary still reads `req.user.role === 'ADMIN'`, its fallback now `req.effectiveUserId`; line 167 now `req.effectiveUserId`; the `isImpersonating` line compares both.

Run: `npm test`
Expected: PASS.

```bash
git add functions/src/routes/followups.js
git commit -m "feat: scope the Calendar to one teammate when a Manager views as them"
```

---

### Task 6: Scope MLS Leads to the effective user

**Files:**
- Modify: `functions/src/routes/mlsLeads.js` — line 33 (mount) and all 16 `req.user.id` code occurrences

**Interfaces:**
- Consumes: `resolveViewAs` from Task 2.
- Produces: nothing new.

Every occurrence of `req.user.id` in this file is ownership scoping; there is no identity use to preserve. That is what makes a file-wide replacement correct here, unlike in `crm.js`.

- [ ] **Step 1: Record the before-count**

Run: `grep -c "req\.user\.id" functions/src/routes/mlsLeads.js`
Expected: `19` (16 in code, 3 inside comments on lines 450, 621, 822).

- [ ] **Step 2: Import and mount the middleware**

After line 6:

```js
const { authenticateToken } = require('../middleware/auth');
```

add:

```js
const { resolveViewAs } = require('../middleware/viewAs');
```

Then at line 33, change:

```js
router.use(authenticateToken);
```

to:

```js
router.use(authenticateToken);
router.use(resolveViewAs);
```

Order matters — `resolveViewAs` reads `req.user`, which `authenticateToken` sets.

- [ ] **Step 3: Replace every occurrence**

Replace all 19 occurrences of `req.user.id` with `req.effectiveUserId` throughout the file, comments included. The code sites are lines 40, 428, 429, 455, 504, 526, 542, 552, 625, 661, 689, 712, 721, 785, 797, 844; the comment mentions on 450, 621, and 822 are updated too so the prose does not drift from the code it describes.

Note line 40 is `POST /import`'s `const userId = req.user.id;`. After this change, importing a workbook while viewing Raul creates leads owned by Raul. That is correct and intended under full-edit view-as.

- [ ] **Step 4: Verify the replacement was complete**

Run: `grep -c "req\.effectiveUserId" functions/src/routes/mlsLeads.js`
Expected: `19`.

Run: `grep -n "req\.user\.id" functions/src/routes/mlsLeads.js`
Expected: no output — but `req.user.role` or other `req.user` reads, if any, must remain untouched. Confirm with `grep -n "req\.user" functions/src/routes/mlsLeads.js` that nothing unintended changed.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test`
Expected: PASS — `functions/src/lib/mlsOwner.test.js`, `mlsOfficers.test.js`, `mlsWorkbook.test.js`, and `skipTrace.test.js` all test `lib/` helpers and must stay green.

```bash
git add functions/src/routes/mlsLeads.js
git commit -m "feat: scope MLS Leads to the effective user"
```

---

### Task 7: `ViewAsContext`

**Files:**
- Create: `src/contexts/ViewAsContext.tsx`
- Test: `src/contexts/ViewAsContext.test.tsx`
- Modify: `src/App.tsx:24-37` (mount the provider)

**Interfaces:**
- Consumes: `VIEW_AS_STORAGE_KEY`, `getUsers`, `TeamMember` from `src/lib/api.ts` (Task 3 added the first).
- Produces: `ViewAsProvider` and `useViewAs()` returning `{ viewAsUserId: string | null, viewAsUser: TeamMember | null, teamMembers: TeamMember[], setViewAs: (userId: string | null) => void }`. Tasks 8 and 9 consume `useViewAs`.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/ViewAsContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ViewAsProvider, useViewAs } from './ViewAsContext'
import { VIEW_AS_STORAGE_KEY } from '@/lib/api'
import * as api from '@/lib/api'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'

const asAuth = (value: unknown) => (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value)

function Probe() {
  const { viewAsUserId } = useViewAs()
  return <span data-testid="viewing">{viewAsUserId ?? 'self'}</span>
}

const renderProbe = () =>
  render(
    <ViewAsProvider>
      <Probe />
    </ViewAsProvider>
  )

describe('ViewAsContext', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getUsers').mockResolvedValue({ users: [] })
  })
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('restores a stored selection for a Manager', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' }, isLoading: false })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('teammate-1'))
  })

  it('clears a stored selection for a non-Manager', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: { id: 'op1', username: 'raul', role: 'OPERATOR' }, isLoading: false })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('self'))
    expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull()
  })

  it('clears a stale selection naming the Manager themselves', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'mgr1')
    asAuth({ user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' }, isLoading: false })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('self'))
    expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull()
  })

  it('clears the selection on logout', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: null, isLoading: false })
    renderProbe()
    await waitFor(() => expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull())
  })

  it('does not touch storage while auth is still resolving', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: null, isLoading: true })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('self'))
    expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBe('teammate-1')
  })

  it('excludes the signed-in Manager from the teammate list', async () => {
    vi.spyOn(api, 'getUsers').mockResolvedValue({
      users: [
        { id: 'mgr1', username: 'robbie', email: 'r@x.com', role: 'ADMIN', isActive: true, createdAt: '' },
        { id: 'op1', username: 'raul', email: 'a@x.com', role: 'OPERATOR', isActive: true, createdAt: '' },
      ],
    })
    asAuth({ user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' }, isLoading: false })

    function ListProbe() {
      const { teamMembers } = useViewAs()
      return <span data-testid="names">{teamMembers.map((m) => m.username).join(',')}</span>
    }
    render(
      <ViewAsProvider>
        <ListProbe />
      </ViewAsProvider>
    )
    await waitFor(() => expect(screen.getByTestId('names').textContent).toBe('raul'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/contexts/ViewAsContext.test.tsx`
Expected: FAIL — cannot resolve `./ViewAsContext`.

- [ ] **Step 3: Write the implementation**

Create `src/contexts/ViewAsContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUsers, VIEW_AS_STORAGE_KEY, type TeamMember } from '@/lib/api';

interface ViewAsContextType {
  viewAsUserId: string | null;
  viewAsUser: TeamMember | null;
  teamMembers: TeamMember[];
  setViewAs: (userId: string | null) => void;
}

const ViewAsContext = createContext<ViewAsContextType | undefined>(undefined);

const readStored = (): string | null => {
  try {
    return localStorage.getItem(VIEW_AS_STORAGE_KEY);
  } catch {
    return null;
  }
};

const clearStored = () => {
  try {
    localStorage.removeItem(VIEW_AS_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
};

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // localStorage is the source of truth (getAuthHeaders reads it directly).
  // This only mirrors it for rendering, and prunes values that must not stand:
  // a demoted Manager's leftover selection, or a stale self-selection.
  useEffect(() => {
    // Auth resolves asynchronously on every page load, and `user` is null until
    // it does. Clearing storage during that window would wipe the selection on
    // every refresh — the exact opposite of persist-until-exit.
    if (isLoading) return;

    if (!user) {
      clearStored();
      setViewAsUserId(null);
      return;
    }

    const stored = readStored();
    if (!stored) {
      setViewAsUserId(null);
      return;
    }

    if (!isAdmin || stored === user.id) {
      clearStored();
      setViewAsUserId(null);
      return;
    }

    setViewAsUserId(stored);
  }, [user, isAdmin, isLoading]);

  useEffect(() => {
    if (!isAdmin || !user) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    getUsers()
      .then((res) => {
        if (!cancelled) setTeamMembers(res.users.filter((m) => m.id !== user.id));
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user]);

  /**
   * Reloads so every cached record in the app refetches under the new account
   * at once. Threading an invalidation signal into useCrmStore, the calendar
   * hook and the MLS fetcher instead would leave any hook we missed showing one
   * teammate's data under a banner naming another. The selection lives in
   * localStorage, so it survives the reload and the switch looks seamless.
   */
  const setViewAs = useCallback((userId: string | null) => {
    if (userId) {
      try {
        localStorage.setItem(VIEW_AS_STORAGE_KEY, userId);
      } catch {
        /* storage unavailable — the switch cannot persist, so do not reload */
        return;
      }
    } else {
      clearStored();
    }
    window.location.reload();
  }, []);

  const viewAsUser = teamMembers.find((m) => m.id === viewAsUserId) ?? null;

  return (
    <ViewAsContext.Provider value={{ viewAsUserId, viewAsUser, teamMembers, setViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  const context = useContext(ViewAsContext);
  if (context === undefined) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/contexts/ViewAsContext.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mount the provider**

In `src/App.tsx`, add the import:

```tsx
import { ViewAsProvider } from "@/contexts/ViewAsContext";
```

and wrap the tree inside `AuthProvider` — it reads `useAuth()`, so it must sit inside it. Change:

```tsx
    <AuthProvider>
      <TooltipProvider>
```

to:

```tsx
    <AuthProvider>
      <ViewAsProvider>
        <TooltipProvider>
```

and the matching close, from:

```tsx
      </TooltipProvider>
    </AuthProvider>
```

to:

```tsx
        </TooltipProvider>
      </ViewAsProvider>
    </AuthProvider>
```

Re-indent the lines between them by two spaces to match.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/contexts/ViewAsContext.tsx src/contexts/ViewAsContext.test.tsx src/App.tsx
git commit -m "feat: add ViewAsContext holding the Manager's selected teammate"
```

---

### Task 8: The top-bar picker

**Files:**
- Modify: `src/components/layout/TopBar.tsx:93` (the right-hand control group)
- Test: `src/components/layout/TopBar.test.tsx` (extend)

**Interfaces:**
- Consumes: `useViewAs` from Task 7.
- Produces: nothing new. `TopBar`'s props are unchanged — it reads context directly, as it already does for `useAuth()` at line 34.

- [ ] **Step 1: Write the failing test**

`src/components/layout/TopBar.test.tsx` already mocks `@/contexts/AuthContext` at line 6. Add a mock for the new context below it:

```tsx
vi.mock('@/contexts/ViewAsContext', () => ({
  useViewAs: vi.fn(() => ({
    viewAsUserId: null,
    viewAsUser: null,
    teamMembers: [],
    setViewAs: vi.fn(),
  })),
}))
```

and import it alongside the existing `useAuth` import:

```tsx
import { useViewAs } from '@/contexts/ViewAsContext'
```

Then add this describe block at the end of the file:

```tsx
describe('TopBar view-as picker', () => {
  const asViewAs = (value: unknown) =>
    (useViewAs as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value)

  const teammates = [
    { id: 'op1', username: 'raul', email: 'a@x.com', role: 'OPERATOR' as const, isActive: true, createdAt: '' },
  ]

  beforeEach(() => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({ notifications: [], count: 0 })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the picker to a Manager who has teammates', () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' },
      logout: vi.fn(),
    })
    asViewAs({ viewAsUserId: null, viewAsUser: null, teamMembers: teammates, setViewAs: vi.fn() })
    render(<TopBar {...defaultProps} />)
    expect(screen.getByLabelText(/view as teammate/i)).toBeTruthy()
  })

  it('hides the picker from a non-Manager', () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'op1', username: 'raul', role: 'OPERATOR' },
      logout: vi.fn(),
    })
    asViewAs({ viewAsUserId: null, viewAsUser: null, teamMembers: teammates, setViewAs: vi.fn() })
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByLabelText(/view as teammate/i)).toBeNull()
  })

  it('hides the picker from a Manager with no teammates', () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' },
      logout: vi.fn(),
    })
    asViewAs({ viewAsUserId: null, viewAsUser: null, teamMembers: [], setViewAs: vi.fn() })
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByLabelText(/view as teammate/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/layout/TopBar.test.tsx`
Expected: FAIL — cannot resolve `@/contexts/ViewAsContext` in `TopBar`, and no element has that accessible name.

- [ ] **Step 3: Write the implementation**

In `src/components/layout/TopBar.tsx`, add the import:

```tsx
import { useViewAs } from '@/contexts/ViewAsContext'
```

and read it next to the existing `useAuth()` call on line 34:

```tsx
  const { viewAsUserId, teamMembers, setViewAs } = useViewAs()
```

Then inside the right-hand control group at line 93 (`<div className="ml-auto flex items-center gap-1">`), as its first child, before the Refresh button:

```tsx
          {isAdmin && teamMembers.length > 0 && (
            <select
              aria-label="View as teammate"
              className="mr-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={viewAsUserId ?? '__self__'}
              onChange={(e) => setViewAs(e.target.value === '__self__' ? null : e.target.value)}
            >
              <option value="__self__">My account</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username}
                </option>
              ))}
            </select>
          )}
```

A native `<select>` rather than the shadcn `Select`: this control's only job is to fire `setViewAs`, which immediately reloads the page, and a native element keeps the accessible-name assertion above straightforward without a portal.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/layout/TopBar.test.tsx`
Expected: PASS — the three new tests plus every pre-existing one in the file.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/TopBar.tsx src/components/layout/TopBar.test.tsx
git commit -m "feat: add the Manager's view-as picker to the top bar"
```

---

### Task 9: The impersonation banner

**Files:**
- Modify: `src/components/layout/AppShell.tsx:44-58`

**Interfaces:**
- Consumes: `useViewAs` from Task 7.
- Produces: nothing.

This banner is the primary safeguard for full-edit plus persist-until-exit, and the reason the spec specifies no audit log.

- [ ] **Step 1: Add the banner**

In `src/components/layout/AppShell.tsx`, add the import:

```tsx
import { useViewAs } from '@/contexts/ViewAsContext'
```

and read it as the first line of the component body, above the existing `useState` calls on line 20:

```tsx
  const { viewAsUser, viewAsUserId, setViewAs } = useViewAs()
```

Then between the `<TopBar ... />` element (which closes on line 54) and the `<div className="flex-1 overflow-y-auto">` on line 55, insert:

```tsx
        {viewAsUserId && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
          >
            <span className="font-medium">
              Viewing {viewAsUser?.username ?? 'a teammate'}'s account as Manager — anything you
              change saves to {viewAsUser?.username ?? 'them'}.
            </span>
            <button
              type="button"
              onClick={() => setViewAs(null)}
              className="ml-auto rounded-md border border-amber-500/50 px-2 py-1 text-xs font-medium hover:bg-amber-500/20"
            >
              Exit
            </button>
          </div>
        )}
```

Deliberately not dismissible: only Exit removes it, because the selection otherwise persists across days.

It renders on `viewAsUserId`, not on `viewAsUser`, so the banner still appears while the team list is loading — the state is dangerous the moment it is set, not once a username resolves.

- [ ] **Step 2: Verify the suite is green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: show a persistent banner while a Manager views a teammate"
```

---

### Task 10: Mark the superseded spec and verify end to end

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-manager-normal-user-views-design.md` (Part 2 heading)

- [ ] **Step 1: Mark the old spec's Part 2 as superseded**

In `docs/superpowers/specs/2026-09-13-manager-normal-user-views-design.md`, directly under the heading `## Part 2: Manager "View As" Override for CRM Data`, insert:

```markdown
> **Superseded and never implemented.** This part was planned but no code was
> ever written for it — `asUserId` and `resolveRequestedUserId` appear only in
> this document. It is replaced by
> `docs/superpowers/specs/2026-09-20-manager-view-as-teammate-design.md`, which
> covers CRM, Calendar, and MLS Leads through an `X-View-As-User` header and a
> global switch rather than a CRM-only query parameter.
>
> Part 1 of this spec (the role dropdown) **was** implemented and is live.
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS, with the new files included — `functions/src/lib/viewAs.test.js`, `src/lib/api.test.ts`, `src/contexts/ViewAsContext.test.tsx`, and the extended `src/components/layout/TopBar.test.tsx`.

- [ ] **Step 3: Confirm the opt-in boundary held**

Run: `grep -rn "effectiveUserId" functions/src/routes/`
Expected: matches in exactly three files — `crm.js`, `followups.js`, `mlsLeads.js`. Any match in another route file means the middleware leaked beyond its intended scope and must be reverted there.

Run: `grep -rn "resolveViewAs" functions/src/index.js`
Expected: no output. The middleware must never be mounted globally.

- [ ] **Step 4: Manual verification against the live app**

Sign in as a Manager and confirm, in order:

1. The picker appears in the top bar; a non-Manager account does not see it.
2. Selecting a teammate reloads the page, and the amber banner names them.
3. CRM shows that teammate's leads, not yours.
4. Calendar shows only that teammate's follow-ups — not the merged everyone view.
5. MLS Leads shows that teammate's leads.
6. Creating a follow-up while switched, then exiting, shows that follow-up in the teammate's calendar and not in your own.
7. A hard refresh keeps you switched, with the banner still showing.
8. Exit returns every tab to your own data.
9. Dashboard, with nobody selected, still shows the whole team's follow-ups.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-13-manager-normal-user-views-design.md
git commit -m "docs: mark the 2026-09-13 view-as design as superseded and unbuilt"
```
