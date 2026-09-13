# Manager vs. Normal User Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-assignment control to the Team tab (Manager/Normal User), and let a manager temporarily view and edit a teammate's private CRM data for troubleshooting, without changing the fact that the CRM stays private per user for everyone else.

**Architecture:** Part 1 exposes an already-fully-supported backend capability (`PUT /api/users/:id` already accepts a `role` change) through a new UI control, plus one small backend hardening guard. Part 2 adds a manager-only, admin-checked `asUserId` override to the two existing whole-state CRM endpoints, threaded from a new picker in the CRM tab, through the Zustand store's existing hydrate/persist flow, down to the two fetch calls that talk to those endpoints.

**Tech Stack:** React 19 + TypeScript + Vite (frontend, Vitest), Express + Prisma + PostgreSQL (backend, `functions/src/`, no route-level test coverage by established convention — only pure logic in `functions/src/lib/` is unit-tested).

**Spec:** `docs/superpowers/specs/2026-09-13-manager-normal-user-views-design.md`

## Global Constraints

- The `UserRole` enum stays `ADMIN | OPERATOR | VIEWER` in the database — only UI *labels* change (`ADMIN` → "Manager", `OPERATOR` → "Normal User"). Never rename the enum or touch existing JWTs/rows.
- `VIEWER` stays completely unused — no task in this plan assigns it or checks for it.
- No new backend route-level tests — this repo has zero route/middleware test coverage by established convention (confirmed across ~15+ existing routes before this plan was written). Pure logic extracted to `functions/src/lib/` gets unit tests; route wiring is verified by full-suite regression runs and careful review instead.
- Never let an admin change their own role away from `ADMIN` (mirrors the existing self-deactivation guard).
- "View as" never persists across a page refresh, a URL, or navigation away from the CRM tab — it always starts back at "My leads" on a fresh mount. Do not add localStorage, a hash param, or any other persistence for it.
- A manager impersonating a genuinely-empty teammate account must see a real empty state, never seeded demo data — seeding stays tied exclusively to loading your *own* account.

---

### Task 1: Backend guard — block self-demotion

**Files:**
- Modify: `functions/src/routes/users.js:125-127` (the existing role-change guard)

**Interfaces:**
- Consumes: nothing new — this only adds a condition inside the existing `PUT /:id` handler.
- Produces: nothing new — no other task depends on this change.

This repo has no test file for `users.js` (route-level code isn't unit-tested here — see Global Constraints). Verification is: read the diff carefully, then run the full suite to confirm no regressions.

- [ ] **Step 1: Read the current guard**

Open `functions/src/routes/users.js` and confirm lines 124-127 currently read exactly:

```js
      // Only admins can change roles
      if (updates.role && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change user roles' });
      }
```

If this doesn't match exactly, stop and report — the file has changed since this plan was written.

- [ ] **Step 2: Add the self-demotion guard**

Immediately after that block (and before the existing `isActive` guards that follow it), add:

```js
      // Admins can't strip their own admin status — mirrors the
      // self-deactivation guard below, for the same reason: losing this
      // role via your own request would lock you out of the Team tab
      // with no way back in except direct database access.
      if (updates.role && updates.role !== 'ADMIN' && req.user.id === id) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }
```

The full block, in order, should now read:

```js
      // Only admins can change roles
      if (updates.role && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change user roles' });
      }

      // Admins can't strip their own admin status — mirrors the
      // self-deactivation guard below, for the same reason: losing this
      // role via your own request would lock you out of the Team tab
      // with no way back in except direct database access.
      if (updates.role && updates.role !== 'ADMIN' && req.user.id === id) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      // Only admins can change account status
      if (updates.isActive !== undefined && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change account status' });
      }
      if (updates.isActive === false && req.user.id === id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (this file has no dedicated test suite of its own — you're checking for regressions elsewhere, e.g. in anything that calls `PUT /api/users/:id`, of which there are none in the test suite today).

- [ ] **Step 4: Commit**

```bash
git add functions/src/routes/users.js
git commit -m "fix: block an admin from demoting their own role"
```

---

### Task 2: Frontend — role assignment UI in the Team tab

**Files:**
- Modify: `src/lib/api.ts` (add `setUserRole`, right after the existing `setUserActive`)
- Modify: `src/components/team/TeamView.tsx` (replace the static role cell with a `Select`)
- Modify: `src/components/team/TeamView.test.tsx` (add role-change test coverage)

**Interfaces:**
- Consumes: `TeamMember` and `UpdatedTeamMember` (both already exist in `src/lib/api.ts`, unchanged by this task) — `TeamMember.role: 'ADMIN' | 'OPERATOR' | 'VIEWER'`.
- Produces: `setUserRole(id: string, role: 'ADMIN' | 'OPERATOR'): Promise<UpdatedTeamMember>`, exported from `src/lib/api.ts`. No later task in this plan consumes it, but it's the shape any future caller should expect.

- [ ] **Step 1: Add `setUserRole` to `src/lib/api.ts`**

Find the existing `setUserActive` function (it ends with a closing `}` a few lines after `export async function setUserActive`). Immediately after it, add:

```ts
export async function setUserRole(id: string, role: 'ADMIN' | 'OPERATOR'): Promise<UpdatedTeamMember> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update role');
  }
  return response.json();
}
```

(`UpdatedTeamMember` is already defined a few lines above `setUserActive` in this same file — do not redefine it.)

- [ ] **Step 2: Write the failing tests in `TeamView.test.tsx`**

Open `src/components/team/TeamView.test.tsx`. This task adds the first
test in this file that interacts with a Radix `Select` (the new role
dropdown) — jsdom has no `hasPointerCapture`/`scrollIntoView`, which
Radix's `Select` calls internally, so add this polyfill right after the
existing imports, before the `vi.mock(...)` calls (confirmed necessary
and sufficient by direct testing — without it, interacting with the
`Select` throws `TypeError: target.hasPointerCapture is not a function`):

```tsx
// jsdom has no hasPointerCapture/scrollIntoView, which Radix's Select
// (the new role dropdown below) calls internally when it opens/closes.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
```

Add `mockSetUserRole` next to the other mocks near the top:

```tsx
const mockSetUserRole = vi.fn();
```

Add it to the `vi.mock('@/lib/api', ...)` block, alongside the existing entries:

```tsx
vi.mock('@/lib/api', () => ({
  getInvites: () => mockInvites(),
  getUsers: () => mockUsers(),
  createInvite: (email: string) => mockCreateInvite(email),
  revokeInvite: (id: string) => mockRevokeInvite(id),
  setUserActive: (id: string, isActive: boolean) => mockSetUserActive(id, isActive),
  setUserRole: (id: string, role: string) => mockSetUserRole(id, role),
}));
```

Add two new tests inside the existing `describe('TeamView', ...)` block, after the last one:

```tsx
  it('changes a teammate\'s role and refreshes the list', async () => {
    const user = userEvent.setup();
    mockSetUserRole.mockResolvedValue({ id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'ADMIN', isActive: true, updatedAt: '2026-02-02T00:00:00.000Z' });
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('luciano')).toBeTruthy());

    await user.click(screen.getByRole('combobox', { name: /luciano.*role/i }));
    await user.click(await screen.findByRole('option', { name: 'Manager' }));

    await waitFor(() => expect(mockSetUserRole).toHaveBeenCalledWith('u2', 'ADMIN'));
    expect(mockUsers).toHaveBeenCalledTimes(2); // initial load + refresh after change
  });

  it('disables the role control for the signed-in admin\'s own row', async () => {
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('luciano')).toBeTruthy());

    expect(screen.getByRole('combobox', { name: /raul.*role/i })).toHaveProperty('disabled', true);
  });
```

These reference an accessible name pattern (`/luciano.*role/i`, `/raul.*role/i`) that Step 3 below must actually produce — a Radix `Select`'s trigger needs an `aria-label` for this to work; that's included in the implementation below.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/team/TeamView.test.tsx`
Expected: FAIL — `setUserRole` isn't exported from the mocked module shape the component expects yet, and no role combobox exists.

- [ ] **Step 4: Implement the role `Select` in `TeamView.tsx`**

Add to the existing imports at the top of the file:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

and add `setUserRole` to the existing `@/lib/api` import line (which currently imports `createInvite, getInvites, getUsers, revokeInvite, setUserActive`):

```tsx
import {
  createInvite,
  getInvites,
  getUsers,
  revokeInvite,
  setUserActive,
  setUserRole,
  type TeamInvite,
  type TeamMember,
} from '@/lib/api';
```

Add this constant near the top of the file, alongside `INVITE_STATUS_TONE`:

```tsx
const ROLE_LABELS: Record<'ADMIN' | 'OPERATOR', string> = {
  ADMIN: 'Manager',
  OPERATOR: 'Normal User',
};
```

Inside the component, add a new state next to the existing `togglingId`:

```tsx
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
```

Add a new handler next to `handleToggleActive`:

```tsx
  const handleRoleChange = async (member: TeamMember, role: 'ADMIN' | 'OPERATOR') => {
    if (role === member.role) return;
    setChangingRoleId(member.id);
    try {
      await setUserRole(member.id, role);
      await load();
    } catch (err) {
      toast({ title: 'Failed to update role', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setChangingRoleId(null);
    }
  };
```

Replace the existing role cell:

```tsx
                    <td className="px-4 py-2 text-muted-foreground">{member.role}</td>
```

with:

```tsx
                    <td className="px-4 py-2">
                      <Select
                        value={member.role === 'VIEWER' ? 'OPERATOR' : member.role}
                        disabled={isSelf || changingRoleId === member.id}
                        onValueChange={(value) => handleRoleChange(member, value as 'ADMIN' | 'OPERATOR')}
                      >
                        <SelectTrigger
                          aria-label={`${member.username}'s role`}
                          className="h-8 w-[140px] text-xs"
                          title={isSelf ? "You can't change your own role" : undefined}
                        >
                          <SelectValue>{ROLE_LABELS[member.role === 'VIEWER' ? 'OPERATOR' : member.role]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Manager</SelectItem>
                          <SelectItem value="OPERATOR">Normal User</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
```

(`isSelf` is already computed above this in the existing `.map()` callback — reuse it, don't redeclare it. `member.role === 'VIEWER'` never happens in practice since nothing assigns that role, but the fallback keeps the `Select`'s controlled value one of its two real options.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/team/TeamView.test.tsx`
Expected: PASS — all 6 tests (4 existing + 2 new).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass, no regressions elsewhere.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api.ts src/components/team/TeamView.tsx src/components/team/TeamView.test.tsx
git commit -m "feat: add a role-assignment control to the Team tab"
```

---

### Task 3: Backend — `resolveRequestedUserId` in `crmScope.js`

**Files:**
- Modify: `functions/src/lib/crmScope.js`
- Modify: `functions/src/lib/crmScope.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveRequestedUserId(requestingUser: { id: string, role: string }, asUserId: string | undefined): string` — returns the effective userId, or throws an `Error` with `.code === FORBIDDEN_VIEW_AS_CODE` if a non-admin passes an `asUserId` for someone else. Also exports `FORBIDDEN_VIEW_AS_CODE: 'FORBIDDEN_VIEW_AS'`. Task 4 imports both from `../lib/crmScope`.

- [ ] **Step 1: Write the failing tests**

Open `functions/src/lib/crmScope.test.js`. Add this new `describe` block after the existing `describe('error codes', ...)` block:

```js
describe('resolveRequestedUserId', () => {
  it('returns the caller\'s own id when no override is requested', () => {
    expect(resolveRequestedUserId({ id: 'u1', role: 'OPERATOR' }, undefined)).toBe('u1');
  });

  it('returns the caller\'s own id when the override names themselves', () => {
    expect(resolveRequestedUserId({ id: 'u1', role: 'OPERATOR' }, 'u1')).toBe('u1');
  });

  it('lets an admin view a different account', () => {
    expect(resolveRequestedUserId({ id: 'admin1', role: 'ADMIN' }, 'u2')).toBe('u2');
  });

  it('refuses a non-admin trying to view a different account', () => {
    expect(() => resolveRequestedUserId({ id: 'u1', role: 'OPERATOR' }, 'u2')).toThrow();
    try {
      resolveRequestedUserId({ id: 'u1', role: 'OPERATOR' }, 'u2');
    } catch (err) {
      expect(err.code).toBe(FORBIDDEN_VIEW_AS_CODE);
    }
  });
});
```

Update the import at the top of the test file to include the two new names:

```js
import {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  resolveRequestedUserId,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
  FORBIDDEN_VIEW_AS_CODE,
} from './crmScope.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run functions/src/lib/crmScope.test.js`
Expected: FAIL — `resolveRequestedUserId` and `FORBIDDEN_VIEW_AS_CODE` are not exported yet.

- [ ] **Step 3: Implement in `crmScope.js`**

Add this near the bottom of the file, just before the `module.exports` block:

```js
const FORBIDDEN_VIEW_AS_CODE = 'FORBIDDEN_VIEW_AS';

/**
 * A caller always acts as themselves unless they explicitly ask to view
 * another account's CRM data (the Team tab's "view as" control) — allowed
 * for ADMIN only. Whether the target account actually exists is a
 * database question the caller (crm.js) answers separately, since this
 * file stays dependency-free on purpose.
 */
const resolveRequestedUserId = (requestingUser, asUserId) => {
  if (!asUserId || asUserId === requestingUser.id) return requestingUser.id;
  if (requestingUser.role !== 'ADMIN') {
    const err = new Error("Only a manager can view another account's CRM data");
    err.code = FORBIDDEN_VIEW_AS_CODE;
    throw err;
  }
  return asUserId;
};
```

Update the `module.exports` block at the end of the file to add the two new names (everything else in it stays exactly the same):

```js
module.exports = {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  resolveRequestedUserId,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
  FORBIDDEN_VIEW_AS_CODE,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/src/lib/crmScope.test.js`
Expected: PASS — all tests (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/crmScope.js functions/src/lib/crmScope.test.js
git commit -m "feat: add resolveRequestedUserId for manager CRM view-as"
```

---

### Task 4: Backend — wire `asUserId` into `crm.js`'s GET/PUT `/state`

**Files:**
- Modify: `functions/src/routes/crm.js`

**Interfaces:**
- Consumes: `resolveRequestedUserId`, `FORBIDDEN_VIEW_AS_CODE` from `../lib/crmScope` (Task 3).
- Produces: `GET /api/crm/state?asUserId=<id>` and `PUT /api/crm/state?asUserId=<id>` — ADMIN-only override, 403 for a non-admin, 404 if `<id>` doesn't name a real user. Task 5 (frontend `dataService.ts`) is the first consumer of this query parameter.

No dedicated test file for this task (route-level code isn't unit-tested in this repo — see Global Constraints). Verification is the full suite plus careful review of the diff against the exact code below.

- [ ] **Step 1: Update the `crmScope` import**

Find the existing destructuring import near the top of `functions/src/routes/crm.js`:

```js
const {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
} = require('../lib/crmScope');
```

Replace it with:

```js
const {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  resolveRequestedUserId,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
  FORBIDDEN_VIEW_AS_CODE,
} = require('../lib/crmScope');
```

- [ ] **Step 2: Update `GET /state`**

Find:

```js
router.get('/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [leads, deals, tasks, activities] = await Promise.all([
```

Replace with:

```js
router.get('/state', authenticateToken, async (req, res) => {
  try {
    const asUserId = typeof req.query.asUserId === 'string' ? req.query.asUserId : undefined;
    const userId = resolveRequestedUserId(req.user, asUserId);
    if (userId !== req.user.id) {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) return res.status(404).json({ error: 'Team member not found' });
    }
    const [leads, deals, tasks, activities] = await Promise.all([
```

Find this handler's `catch` block:

```js
  } catch (err) {
    console.error('[CRM] GET /state error:', err);
    res.status(500).json({ error: 'Failed to load CRM state' });
  }
});
```

(This is the first `} catch (err) {` after `router.get('/state', ...)` — do not confuse it with the `POST /scan-corrections` handler above it, which has its own unrelated `catch`.)

Replace with:

```js
  } catch (err) {
    if (err.code === FORBIDDEN_VIEW_AS_CODE) {
      return res.status(403).json({ error: err.message });
    }
    console.error('[CRM] GET /state error:', err);
    res.status(500).json({ error: 'Failed to load CRM state' });
  }
});
```

- [ ] **Step 3: Update `PUT /state`**

Find:

```js
router.put('/state', authenticateToken, async (req, res) => {
  const { leads = [], deals = [], tasks = [], activities = [] } = req.body;
  const userId = req.user.id;

  try {
    await prisma.$transaction(async (tx) => {
```

Replace with:

```js
router.put('/state', authenticateToken, async (req, res) => {
  const { leads = [], deals = [], tasks = [], activities = [] } = req.body;
  const asUserId = typeof req.query.asUserId === 'string' ? req.query.asUserId : undefined;

  try {
    const userId = resolveRequestedUserId(req.user, asUserId);
    if (userId !== req.user.id) {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) return res.status(404).json({ error: 'Team member not found' });
    }

    await prisma.$transaction(async (tx) => {
```

The `prisma.$transaction(async (tx) => { ... })` body itself is unchanged — it already only reads `userId`, which is now declared a few lines further up inside the same `try` block instead of before it, but is still in scope for the transaction's closure.

Find this handler's `catch` block:

```js
  } catch (err) {
    if (err.code === EMPTY_PAYLOAD_CODE) {
      return res.status(409).json({
        error: 'Refusing to clear the CRM on an empty save. Reload and try again.',
      });
    }
    if (err.code === FOREIGN_ID_CODE) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[CRM] PUT /state error:', err);
    res.status(500).json({ error: 'Failed to sync CRM state' });
  }
});
```

Replace with:

```js
  } catch (err) {
    if (err.code === FORBIDDEN_VIEW_AS_CODE) {
      return res.status(403).json({ error: err.message });
    }
    if (err.code === EMPTY_PAYLOAD_CODE) {
      return res.status(409).json({
        error: 'Refusing to clear the CRM on an empty save. Reload and try again.',
      });
    }
    if (err.code === FOREIGN_ID_CODE) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[CRM] PUT /state error:', err);
    res.status(500).json({ error: 'Failed to sync CRM state' });
  }
});
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass. Also run `node -c functions/src/routes/crm.js` (Node's syntax-only check — do not `require` this file directly; it transitively loads Prisma's native binary, which is a known, pre-existing, unrelated failure in this Windows sandbox) to confirm the file still parses correctly.

- [ ] **Step 5: Commit**

```bash
git add functions/src/routes/crm.js
git commit -m "feat: let an admin view/edit another account's CRM data via asUserId"
```

---

### Task 5: Frontend — `asUserId` in `dataService.ts`

**Files:**
- Modify: `src/crm/data/dataService.ts`
- Modify: `src/crm/data/dataService.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `dataService.load(asUserId?: string): Promise<LoadResult>` and `dataService.save(state: CrmState, onSaved?: () => void, asUserId?: string): void` — both existing functions gain one new optional trailing parameter; every existing call site (`dataService.load()`, `dataService.save(state)`, `dataService.save(state, onSaved)`) keeps working unchanged. Task 6 (`useCrmStore.ts`) is the consumer of the new parameter.

- [ ] **Step 1: Write the failing tests**

Open `src/crm/data/dataService.test.ts`. Add two new tests, one in the `describe('dataService.load', ...)` block and one in `describe('dataService.save', ...)`:

In `describe('dataService.load', ...)`, add after the last existing test:

```ts
  it('includes asUserId in the request URL when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ leads: [], deals: [], tasks: [], activities: [], settings: undefined }),
    }) as unknown as typeof fetch;

    await dataService.load('teammate-42');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('asUserId=teammate-42'),
      expect.anything(),
    );
  });

  it('omits asUserId from the request URL when not provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ leads: [], deals: [], tasks: [], activities: [], settings: undefined }),
    }) as unknown as typeof fetch;

    await dataService.load();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.not.stringContaining('asUserId'),
      expect.anything(),
    );
  });
```

In `describe('dataService.save', ...)`, add after the last existing test:

```ts
  it('includes asUserId in the request URL when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;

    dataService.save(EMPTY_STATE, undefined, 'teammate-42');
    await flush();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('asUserId=teammate-42'),
      expect.anything(),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/crm/data/dataService.test.ts`
Expected: FAIL — `dataService.load`/`dataService.save` don't accept or use an `asUserId` argument yet.

- [ ] **Step 3: Implement in `dataService.ts`**

Replace the entire `load` method:

```ts
  async load(): Promise<LoadResult> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/state`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const error = await readErrorMessage(
          res,
          'Could not load your CRM data from the server. Please try again.',
        );
        return { ok: false, error };
      }
      const data = await res.json();
      return { ok: true, state: normalizeState(data as CrmState) };
    } catch {
      return {
        ok: false,
        error: 'Could not reach the server to load your CRM data. Check your connection and try again.',
      };
    }
  },
```

with:

```ts
  async load(asUserId?: string): Promise<LoadResult> {
    try {
      const url = asUserId
        ? `${API_BASE_URL}/api/crm/state?asUserId=${encodeURIComponent(asUserId)}`
        : `${API_BASE_URL}/api/crm/state`;
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const error = await readErrorMessage(
          res,
          'Could not load your CRM data from the server. Please try again.',
        );
        return { ok: false, error };
      }
      const data = await res.json();
      return { ok: true, state: normalizeState(data as CrmState) };
    } catch {
      return {
        ok: false,
        error: 'Could not reach the server to load your CRM data. Check your connection and try again.',
      };
    }
  },
```

Replace the entire `save` method:

```ts
  save(state: CrmState, onSaved?: () => void): void {
    fetch(`${API_BASE_URL}/api/crm/state`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state),
    })
      .then(async (res) => {
        if (!res.ok) {
          const message = await readErrorMessage(
            res,
            'Your CRM changes were not saved. Please try again.',
          );
          console.error('[CRM] save rejected:', message);
          toast.error(message);
        } else if (onSaved) {
          // Telemetry failures must never be reported as contact-save failures.
          try { onSaved(); } catch { /* best effort */ }
        }
      })
      .catch((err) => {
        console.error('[CRM] sync error:', err);
        toast.error('Could not reach the server to save your CRM changes. Check your connection and try again.');
      });
  },
```

with:

```ts
  save(state: CrmState, onSaved?: () => void, asUserId?: string): void {
    const url = asUserId
      ? `${API_BASE_URL}/api/crm/state?asUserId=${encodeURIComponent(asUserId)}`
      : `${API_BASE_URL}/api/crm/state`;
    fetch(url, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state),
    })
      .then(async (res) => {
        if (!res.ok) {
          const message = await readErrorMessage(
            res,
            'Your CRM changes were not saved. Please try again.',
          );
          console.error('[CRM] save rejected:', message);
          toast.error(message);
        } else if (onSaved) {
          // Telemetry failures must never be reported as contact-save failures.
          try { onSaved(); } catch { /* best effort */ }
        }
      })
      .catch((err) => {
        console.error('[CRM] sync error:', err);
        toast.error('Could not reach the server to save your CRM changes. Check your connection and try again.');
      });
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/crm/data/dataService.test.ts`
Expected: PASS — all tests (existing + 3 new).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass, no regressions (nothing else calls `dataService.save` with a third argument yet, and the second argument's existing callers are all still valid).

- [ ] **Step 6: Commit**

```bash
git add src/crm/data/dataService.ts src/crm/data/dataService.test.ts
git commit -m "feat: support an asUserId override in dataService.load/save"
```

---

### Task 6: Frontend — `viewingUserId` in `useCrmStore.ts`

**Files:**
- Modify: `src/crm/store/useCrmStore.ts`
- Modify: `src/crm/store/useCrmStore.test.ts`

**Interfaces:**
- Consumes: `dataService.load(asUserId?: string)`, `dataService.save(state, onSaved?, asUserId?: string)` (Task 5).
- Produces: the store's `hydrate` action gains a third optional parameter — `hydrate: (now: Date, ownerKey?: string, viewingUserId?: string) => Promise<void>` — and a new readable field `viewingUserId: string | null`. Every mutation already calls the store's internal `persist()` wrapper, which now automatically saves to whichever account `viewingUserId` names. Task 7 (`CrmView.tsx`) is the consumer of both.

- [ ] **Step 1: Write the failing tests**

Open `src/crm/store/useCrmStore.test.ts`. The whole file (178 lines) is
currently one single top-level `describe('useCrmStore.hydrate', ...)`
block with no other top-level `describe` in it — its closing `})` is the
very last line of the file. Add a new, separate top-level `describe`
block after that closing `})`, at the end of the file:

```ts
describe('useCrmStore viewingUserId (manager "view as")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCrmStore.setState({ ...EMPTY_STATE, hydrated: false, hydrateError: null, viewingUserId: null });
  });

  it('passes viewingUserId through to dataService.load and records it', async () => {
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });

    await useCrmStore.getState().hydrate(now, undefined, 'teammate-42');

    expect(dataService.load).toHaveBeenCalledWith('teammate-42');
    expect(useCrmStore.getState().viewingUserId).toBe('teammate-42');
  });

  it('saves subsequent mutations under the currently viewed account', async () => {
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });
    await useCrmStore.getState().hydrate(now, undefined, 'teammate-42');

    useCrmStore.getState().addLead(newLeadInput);

    expect(dataService.save).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      'teammate-42',
    );
  });

  it('closes the save gate synchronously before the new load resolves', () => {
    let resolveLoad: (value: { ok: true; state: typeof EMPTY_STATE }) => void = () => {};
    vi.mocked(dataService.load).mockReturnValue(
      new Promise((resolve) => { resolveLoad = resolve; }),
    );
    useCrmStore.setState({ ...EMPTY_STATE, hydrated: true, hydrateError: null, viewingUserId: null });

    const promise = useCrmStore.getState().hydrate(now, undefined, 'teammate-42');

    // Still inside the same synchronous tick as the call above — the gate
    // must already be closed before the awaited load has any chance to settle.
    expect(useCrmStore.getState().hydrated).toBe(false);

    resolveLoad({ ok: true, state: { ...EMPTY_STATE } });
    return promise;
  });

  it('reverts to saving as yourself when hydrate is called with no viewingUserId', async () => {
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });
    await useCrmStore.getState().hydrate(now, undefined, 'teammate-42');
    expect(useCrmStore.getState().viewingUserId).toBe('teammate-42');

    await useCrmStore.getState().hydrate(now, ownerKey);
    expect(useCrmStore.getState().viewingUserId).toBeNull();

    useCrmStore.getState().addLead(newLeadInput);
    expect(dataService.save).toHaveBeenLastCalledWith(expect.anything(), undefined, undefined);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/crm/store/useCrmStore.test.ts`
Expected: FAIL — `viewingUserId` doesn't exist on the store yet, and `hydrate` ignores a third argument.

- [ ] **Step 3: Implement in `useCrmStore.ts`**

Update the `Actions` type's `hydrate` signature:

```ts
  hydrate: (now: Date, ownerKey?: string) => Promise<void>
```

to:

```ts
  hydrate: (now: Date, ownerKey?: string, viewingUserId?: string) => Promise<void>
```

Update the store's initial state (currently `...EMPTY_STATE, hydrated: false, hydrateError: null,`):

```ts
    ...EMPTY_STATE,
    hydrated: false,
    hydrateError: null,
```

to:

```ts
    ...EMPTY_STATE,
    hydrated: false,
    hydrateError: null,
    viewingUserId: null,
```

This `viewingUserId: string | null` field also needs to be declared in the `HydrationState` type (which currently declares `hydrated` and `hydrateError`) so TypeScript knows about it:

```ts
type HydrationState = {
  hydrated: boolean
  hydrateError: string | null
  // The account whose CRM data is currently loaded, when it isn't the
  // signed-in user's own — set only via hydrate()'s third argument (the
  // Team tab's "view as" picker). null means "my own data."
  viewingUserId: string | null
}
```

Replace the `persist` function:

```ts
  const persist = (state: CrmState, onSaved?: () => void) => {
    if (!get().hydrated) {
      console.error('[CRM] Skipping save: CRM has not finished loading, so nothing was persisted.')
      return
    }
    if (onSaved) dataService.save(state, onSaved)
    else dataService.save(state)
  }
```

with:

```ts
  const persist = (state: CrmState, onSaved?: () => void) => {
    if (!get().hydrated) {
      console.error('[CRM] Skipping save: CRM has not finished loading, so nothing was persisted.')
      return
    }
    const asUserId = get().viewingUserId ?? undefined
    if (onSaved) dataService.save(state, onSaved, asUserId)
    else dataService.save(state, undefined, asUserId)
  }
```

Replace the start of `hydrate`:

```ts
    hydrate: async (now, ownerKey) => {
      const result = await dataService.load()
```

with:

```ts
    hydrate: async (now, ownerKey, viewingUserId) => {
      // Closes the persist() gate before anything async runs, so a
      // mutation fired mid-switch (e.g. while a manager's "view as"
      // change is still loading) can never save under the wrong account.
      set({ hydrated: false, viewingUserId: viewingUserId ?? null })
      const result = await dataService.load(viewingUserId)
```

No other line in `hydrate`, and no other action in the file, changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/crm/store/useCrmStore.test.ts`
Expected: PASS — all tests (existing + 4 new).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass, no regressions (the two other call sites of `hydrate` — `useCalendarEvents.ts` and this test file's other existing tests — pass 1-2 arguments, which remains valid with the new optional third parameter).

- [ ] **Step 6: Commit**

```bash
git add src/crm/store/useCrmStore.ts src/crm/store/useCrmStore.test.ts
git commit -m "feat: track which account's CRM data is loaded (viewingUserId)"
```

---

### Task 7: Frontend — "view as" picker in `CrmView.tsx`

**Files:**
- Modify: `src/components/crm/CrmView.tsx`
- Create: `src/components/crm/CrmView.test.tsx`

**Interfaces:**
- Consumes: `hydrate(now, ownerKey?, viewingUserId?)` (Task 6); `getUsers(): Promise<{ users: TeamMember[] }>` and `TeamMember` (both already exist, unchanged, in `src/lib/api.ts`); `useAuth()`'s `user.role` (already exists, unchanged, in `src/contexts/AuthContext.tsx`).
- Produces: nothing consumed by a later task — this is the last task in the plan.

`CrmView.tsx` has no existing test file. This task creates one, scoped to the new picker behavior — the sub-tab navigation and scanner wiring already in this file are out of scope for testing here (they're unrelated to this plan and not being changed).

- [ ] **Step 1: Write the failing tests**

Create `src/components/crm/CrmView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmView } from './CrmView';
import { useCrmStore } from '@/crm/store/useCrmStore';
import { EMPTY_STATE } from '@/crm/data/types';

// jsdom has no hasPointerCapture/scrollIntoView, which Radix's Select (the
// "view as" picker below) calls internally when it opens/closes. Confirmed
// necessary and sufficient by direct testing — without it, interacting
// with the Select throws "target.hasPointerCapture is not a function".
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const mockUser = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser() }),
}));

const mockGetUsers = vi.fn();
vi.mock('@/lib/api', () => ({
  getUsers: () => mockGetUsers(),
}));

vi.mock('@/crm/views/ContactsView', () => ({ default: () => <div>Contacts</div> }));
vi.mock('@/crm/views/CrmTasksView', () => ({ default: () => <div>Tasks</div> }));

const hydrateSpy = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  hydrateSpy.mockClear();
  useCrmStore.setState({ ...EMPTY_STATE, hydrated: true, hydrateError: null, viewingUserId: null, hydrate: hydrateSpy });
  mockGetUsers.mockResolvedValue({
    users: [
      { id: 'me', username: 'raul', email: 'raul@example.com', role: 'ADMIN', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'OPERATOR', isActive: true, createdAt: '2026-02-01T00:00:00.000Z' },
    ],
  });
});

describe('CrmView "view as" picker', () => {
  it('shows the picker for an admin with teammates', async () => {
    mockUser.mockReturnValue({ id: 'me', role: 'ADMIN' });
    render(<CrmView />);
    await waitFor(() => expect(screen.getByText('Viewing:')).toBeTruthy());
    expect(screen.getByText('luciano')).toBeTruthy();
  });

  it('hides the picker for a normal user', async () => {
    mockUser.mockReturnValue({ id: 'u2', role: 'OPERATOR' });
    render(<CrmView />);
    await waitFor(() => expect(screen.getByText('Contacts')).toBeTruthy());
    expect(screen.queryByText('Viewing:')).toBeNull();
  });

  it('re-hydrates with the selected teammate\'s id, and shows the banner', async () => {
    const user = userEvent.setup();
    mockUser.mockReturnValue({ id: 'me', role: 'ADMIN' });
    render(<CrmView />);
    await waitFor(() => expect(screen.getByText('Viewing:')).toBeTruthy());
    hydrateSpy.mockClear();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'luciano' }));

    await waitFor(() => expect(hydrateSpy).toHaveBeenCalledWith(expect.any(Date), undefined, 'u2'));
    expect(await screen.findByText(/Viewing luciano's CRM as manager/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/crm/CrmView.test.tsx`
Expected: FAIL — no picker exists yet, `getUsers` is never called.

- [ ] **Step 3: Implement the picker in `CrmView.tsx`**

Add to the existing imports at the top of the file:

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { getUsers, type TeamMember } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

Update the top of the `CrmView` component. Currently:

```tsx
export function CrmView() {
  const hydrate = useCrmStore((s) => s.hydrate);
  const hydrateError = useCrmStore((s) => s.hydrateError);
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<CrmTab>('contacts');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    hydrate(new Date(), user?.id).then(() => setLoaded(true));
  }, [hydrate, user?.id]);
```

(Note: `useAuth` may already be imported and `user` already destructured in this file — if so, don't duplicate the import or the destructure; just add the new lines below.)

Replace with:

```tsx
export function CrmView() {
  const hydrate = useCrmStore((s) => s.hydrate);
  const hydrateError = useCrmStore((s) => s.hydrateError);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<CrmTab>('contacts');
  const [loaded, setLoaded] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [viewAsId, setViewAsId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    getUsers()
      .then((res) => setTeamMembers(res.users.filter((m) => m.id !== user?.id)))
      .catch(() => {});
  }, [isAdmin, user?.id]);

  useEffect(() => {
    setLoaded(false);
    // Never pass an ownerKey while impersonating: ownerKey only seeds demo
    // starter data into a genuinely-empty account, and a manager checking a
    // teammate's empty account must see a real empty state, not write fake
    // seeded leads into that teammate's real account.
    const seedKey = viewAsId ? undefined : user?.id;
    hydrate(new Date(), seedKey, viewAsId ?? undefined).then(() => setLoaded(true));
  }, [hydrate, user?.id, viewAsId]);
```

Find the existing retry button inside the `hydrateError` branch:

```tsx
        <Button size="sm" onClick={() => hydrate(new Date(), user?.id)}>
          Try again
        </Button>
```

Replace with:

```tsx
        <Button size="sm" onClick={() => hydrate(new Date(), viewAsId ? undefined : user?.id, viewAsId ?? undefined)}>
          Try again
        </Button>
```

Find the CRM sub-navigation block:

```tsx
      {/* CRM sub-navigation */}
      <div className="border-b border-border bg-card/20">
```

Insert the picker immediately before it:

```tsx
      {isAdmin && teamMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/20 px-2 py-2 md:px-4">
          <span className="text-xs font-medium text-muted-foreground">Viewing:</span>
          <Select
            value={viewAsId ?? '__self__'}
            onValueChange={(value) => setViewAsId(value === '__self__' ? null : value)}
          >
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__self__">My leads</SelectItem>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>{member.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {viewAsId && (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              Viewing {teamMembers.find((m) => m.id === viewAsId)?.username}'s CRM as manager
            </span>
          )}
        </div>
      )}

      {/* CRM sub-navigation */}
      <div className="border-b border-border bg-card/20">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/crm/CrmView.test.tsx`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: succeeds with zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/crm/CrmView.tsx src/components/crm/CrmView.test.tsx
git commit -m "feat: let a manager view/edit a teammate's CRM data from the CRM tab"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** Part 1 (role UI + self-demotion guard) → Tasks 1-2. Part 2 (crmScope helper, crm.js wiring, dataService, store, CrmView UI) → Tasks 3-7. The spec's "Why other tabs are unaffected" section documents *why* `useCalendarEvents.ts` needs no change — there is no task for it because none is needed; do not add one.
- **Sequencing:** Task 4 depends on Task 3's exports. Task 6 depends on Task 5's new `dataService` signatures. Task 7 depends on Task 6's new `hydrate` signature and reads (unchanged) `getUsers`/`TeamMember` from `src/lib/api.ts`. Tasks 1-2 (Part 1) have no dependency on Tasks 3-7 (Part 2) or vice versa — either part can be done first, but within each part the order above is required.
- **Type consistency check:** `viewingUserId` is spelled identically in Tasks 6 and 7 (`hydrate`'s third parameter name and the store field name). `asUserId` is spelled identically as the query parameter name (Task 4), the `dataService` parameter name (Task 5), and never renamed in between. `setUserRole`'s role union (`'ADMIN' | 'OPERATOR'`) matches `TeamMember['role']`'s two real values exactly (Task 2).
- **jsdom + Radix Select finding:** this repo has no existing test that interacts with a Radix `Select` (only `DropdownMenu`, which doesn't hit this), and Tasks 2 and 7 are the first to add one. Verified directly, before writing this plan, that clicking into an unpolyfilled `Select` throws `TypeError: target.hasPointerCapture is not a function` under this repo's jsdom setup, and that the three-line `Element.prototype` polyfill included in both tasks' steps is sufficient to fix it (built a throwaway probe test against this repo's real `src/components/ui/select.tsx`, confirmed the failure, added the polyfill, confirmed it passes, deleted the probe). Both task's test-writing steps already include this polyfill — do not skip it as unnecessary boilerplate.
