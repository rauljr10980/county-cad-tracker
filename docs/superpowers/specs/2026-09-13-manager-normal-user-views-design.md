# Manager vs. Normal User Views — Design Spec

## Goal

Formalize two user experiences in the Bexar CRE CRM: a **Manager** view and
a **Normal User** view. Managers can hide tabs (already built) and can view
and edit any teammate's private CRM records for troubleshooting/QA. Normal
users keep full CRM data-entry access (already true). Notes/updates on
every module except the CRM are already shared across the whole team; the
CRM stays private per user, as it is today — managers get an explicit,
visible override for that one exception.

## Current State (confirmed by reading the code, no changes needed here)

These already work exactly as wanted, and this spec does not touch them:

- **Hide tabs**: `ManagerViewDialog.tsx` already lets an ADMIN hide tabs
  for the whole team, via `PUT /api/settings/hidden-tabs`
  (`requireRole('ADMIN')`).
- **Normal users already have full CRM functionality**: `functions/src/routes/crm.js`
  only requires `authenticateToken` — no role check gates any CRM action.
- **Notes/updates are already shared everywhere except the CRM**: Property
  notes (`model Note`), Pre-Foreclosure, Eviction Leads, MLS Leads, and
  Tasks have no per-user `where` filtering in their routes — every
  authenticated (or even unauthenticated, for some legacy routes) request
  sees the same shared rows.
- **The CRM is already private per user**: `CrmLead` has a `userId`
  column, and `functions/src/lib/crmScope.js`'s `leadWhere(userId)` /
  `childWhere(userId)` scope every read and write in `crm.js` to the
  caller's own `req.user.id`. This is the "share notes/updates except for
  the CRM" rule already in effect.

## Terminology

The Prisma `UserRole` enum stays `ADMIN | OPERATOR | VIEWER` — renaming it
would touch signed JWTs, every existing user row, and ~8 call sites that
compare `role === 'ADMIN'` across the frontend, for no functional benefit.
Only the **display label** changes: `ADMIN` renders as "Manager",
`OPERATOR` renders as "Normal User" in the Team tab. `VIEWER` stays fully
unused, exactly as today — nothing assigns it, nothing checks for it, and
this spec does not change that.

## Part 1: Role Assignment UI

The backend already fully supports changing a user's role — `PUT
/api/users/:id` (`functions/src/routes/users.js`) already validates
`body('role').optional().isIn(['ADMIN', 'OPERATOR', 'VIEWER'])` and already
guards it to admins only (`functions/src/routes/users.js:125-127`):

```js
// Only admins can change roles
if (updates.role && req.user.role !== 'ADMIN') {
  return res.status(403).json({ error: 'Only admins can change user roles' });
}
```

It's just never been exposed in any UI. This part is: (1) close one small
gap in that existing guard, (2) add the UI.

### Backend: block self-demotion

Today an ADMIN could demote *themselves* to OPERATOR via a direct API call
(the guard above only checks that the *caller* is an admin, not that
they're not editing their own role away from admin). This mirrors the
self-deactivation guard immediately below it in the same file
(`functions/src/routes/users.js:133-135`):

```js
if (updates.isActive === false && req.user.id === id) {
  return res.status(400).json({ error: 'Cannot deactivate your own account' });
}
```

Add, right after the existing role-change guard (after line 127, before the
isActive guards):

```js
if (updates.role && updates.role !== 'ADMIN' && req.user.id === id) {
  return res.status(400).json({ error: 'Cannot change your own role' });
}
```

This only blocks the dangerous direction (an admin giving up their own
admin status) — setting your own role to `'ADMIN'` when you're already
ADMIN is a harmless no-op and stays allowed.

### Frontend: `src/lib/api.ts`

Add a `setUserRole` function immediately after the existing
`setUserActive` (same file, same pattern — `UpdatedTeamMember` already
exists and already types `role: TeamMember['role']`, so no new type is
needed):

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

### Frontend: `src/components/team/TeamView.tsx`

Replace the static role cell:

```tsx
<td className="px-4 py-2 text-muted-foreground">{member.role}</td>
```

with a `Select` (same component already used elsewhere, e.g.
`ContactsView.tsx`'s `FilterSelect`), disabled for your own row exactly
like the existing Deactivate button already is:

```tsx
const ROLE_LABELS: Record<'ADMIN' | 'OPERATOR', string> = {
  ADMIN: 'Manager',
  OPERATOR: 'Normal User',
};

// ...inside the row, `isSelf` already exists in this component:
<td className="px-4 py-2">
  <Select
    value={member.role === 'VIEWER' ? 'OPERATOR' : member.role}
    disabled={isSelf || changingRoleId === member.id}
    onValueChange={(value) => handleRoleChange(member, value as 'ADMIN' | 'OPERATOR')}
  >
    <SelectTrigger
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

(`member.role === 'VIEWER'` never happens in practice — nothing assigns
it — but the fallback keeps the `Select`'s value always one of its two
real options rather than rendering an unmapped third value.)

Add a `changingRoleId` state right next to the existing `togglingId` one
(same line, same pattern: `const [togglingId, setTogglingId] =
useState<string | null>(null);`):

```tsx
const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
```

And a handler mirroring `handleToggleActive`:

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

Add the needed imports (`Select`, `SelectContent`, `SelectItem`,
`SelectTrigger`, `SelectValue` from `@/components/ui/select`, and
`setUserRole` from `@/lib/api`).

## Part 2: Manager "View As" Override for CRM Data

### The problem

The CRM loads and saves as one whole-state blob, always scoped to
`req.user.id` — there is no existing way to ask for another account's
data. `functions/src/routes/crm.js`:

```js
router.get('/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // ...leadWhere(userId), childWhere(userId) everywhere below
```

```js
router.put('/state', authenticateToken, async (req, res) => {
  const { leads = [], deals = [], tasks = [], activities = [] } = req.body;
  const userId = req.user.id;
  // ...
```

### Backend: `functions/src/lib/crmScope.js`

Add a pure, synchronous permission check (no Prisma — this file is
deliberately dependency-free so it stays unit-testable without triggering
Prisma's native binary load). It decides only whether the *attempt* is
allowed; the actual existence check for the target account needs a
database round trip, so that lives in `crm.js` next to this module's other
Prisma calls (consistent with this repo's convention that route-level I/O
is untested, and pure decision logic in `lib/` is):

```js
const FORBIDDEN_VIEW_AS_CODE = 'FORBIDDEN_VIEW_AS';

/**
 * A caller always acts as themselves unless they explicitly ask to view
 * another account's CRM data (the Team tab's "view as" control) — allowed
 * for ADMIN only. Whether the target account actually exists is a
 * database question the caller (crm.js) answers separately.
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

(Add `resolveRequestedUserId` and `FORBIDDEN_VIEW_AS_CODE` to the existing
`module.exports` block — everything else in that block is unchanged.)

### Backend: `functions/src/routes/crm.js`

Import the two new exports alongside the existing ones (same
destructuring block, lines 18-26):

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

`GET /state`'s existing `const userId = req.user.id;` already sits inside
its `try` block, so replace it in place, and add one new branch to its
existing `catch`:

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
      // ...unchanged...
```

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

`PUT /state`'s `const userId = req.user.id;` sits *outside* its `try`
block today. Move it inside, as the first line of the `try`, so the same
resolution and existence check happen there too, and add the same new
branch to its existing `catch` (before the `EMPTY_PAYLOAD_CODE` check):

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
      // ...unchanged — already only references `userId`, now declared
      // above instead of as the removed `const userId = req.user.id;`...
    });

    res.json({ ok: true });
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

The transaction body itself needs no changes — it already only reads the
`userId` variable, which is now declared one scope further out but is
still in scope for the closure.

### Frontend: `src/crm/data/dataService.ts`

Add an optional `asUserId` to both `load` and `save`:

```ts
async load(asUserId?: string): Promise<LoadResult> {
  try {
    const url = asUserId
      ? `${API_BASE_URL}/api/crm/state?asUserId=${encodeURIComponent(asUserId)}`
      : `${API_BASE_URL}/api/crm/state`;
    const res = await fetch(url, { headers: getAuthHeaders() });
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
        try { onSaved(); } catch { /* best effort */ }
      }
    })
    .catch((err) => {
      console.error('[CRM] sync error:', err);
      toast.error('Could not reach the server to save your CRM changes. Check your connection and try again.');
    });
},
```

### Frontend: `src/crm/store/useCrmStore.ts`

Add `viewingUserId: string | null` next to `hydrated`/`hydrateError` in
the store's state, and thread it through `hydrate` and `persist`.

Update the `Actions` type:

```ts
hydrate: (now: Date, ownerKey?: string, viewingUserId?: string) => Promise<void>
```

Update the initial state:

```ts
...EMPTY_STATE,
hydrated: false,
hydrateError: null,
viewingUserId: null,
```

Update `persist` to read the current target from the store instead of
always saving as "me" (only this one function changes — every one of the
~20 call sites that already call `persist(snapshot(next))` or
`persist(snapshot(next), onSaved)` needs no edits, since `persist` looks
up `viewingUserId` itself):

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

Update `hydrate`'s first two lines (the rest of the function is
unchanged — it already just uses the local `ownerKey` parameter for
seeding/merging, and `dataService.load()` becomes `dataService.load(viewingUserId)`):

```ts
hydrate: async (now, ownerKey, viewingUserId) => {
  // Closes the persist() gate before anything async runs, so a mutation
  // fired mid-switch (e.g. while a manager's "view as" change is still
  // loading) can never save under the wrong account.
  set({ hydrated: false, viewingUserId: viewingUserId ?? null })
  const result = await dataService.load(viewingUserId)
  if (!result.ok) {
    set({ hydrateError: result.error, hydrated: false })
    return
  }
  // ...unchanged from here down...
```

No other action in this file changes — `addLead`, `updateLead`, etc. all
already just call `persist(snapshot(next))`, which now transparently
saves to whichever account `viewingUserId` currently names.

### Frontend: `src/components/crm/CrmView.tsx`

This is the only place `hydrate` is called with a *choice* of whose data
to load (the other call site, `useCalendarEvents.ts`, deliberately keeps
calling `crmHydrate(new Date(), user?.id)` with no third argument — see
"Why other tabs are unaffected" below).

Add local state for the picker, fetch the team list once (admin only),
and pass the selection into `hydrate`:

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { getUsers, type TeamMember } from '@/lib/api';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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
    // Never pass an ownerKey while impersonating: ownerKey is only used to
    // seed demo starter data into a genuinely-empty account, and a manager
    // checking on a teammate's empty account must see a real empty state,
    // not accidentally write fake seeded leads into that teammate's account.
    const seedKey = viewAsId ? undefined : user?.id;
    hydrate(new Date(), seedKey, viewAsId ?? undefined).then(() => setLoaded(true));
  }, [hydrate, user?.id, viewAsId]);
  // ...
```

Update the existing "Try again" retry button (currently `onClick={() =>
hydrate(new Date(), user?.id)}`) to match:

```tsx
<Button size="sm" onClick={() => hydrate(new Date(), viewAsId ? undefined : user?.id, viewAsId ?? undefined)}>
```

Add the picker UI above the existing Contacts/Tasks sub-nav, admin-only,
hidden when there are no teammates to view:

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
```

### Why other tabs are unaffected

`src/hooks/useCalendarEvents.ts` (used by both `Dashboard.tsx` and
`CalendarView.tsx`) already calls its own, independent hydrate:

```ts
useEffect(() => {
  crmHydrate(new Date(), user?.id);
}, [crmHydrate, user?.id]);
```

It never passes a third argument, so the moment a manager navigates away
from the CRM tab to Dashboard or Calendar, this effect re-hydrates the
store back to the manager's *own* data automatically — no new code is
needed to "exit" view-as mode. This spec deliberately leaves this file
untouched; the reset-on-navigate behavior is a side effect of an existing
call site, not new logic, and is worth calling out so a future reader
doesn't wonder why there's no explicit cleanup in `CrmView.tsx`.

## Testing Plan

- `functions/src/lib/crmScope.test.js`: add a `describe('resolveRequestedUserId')`
  block covering: self-view (no `asUserId`, or `asUserId === self`) returns
  own id; non-admin passing any `asUserId` throws with
  `FORBIDDEN_VIEW_AS_CODE`; admin passing a different id returns that id
  unchanged. Pure function, no Prisma needed — matches this file's
  existing test style exactly.
- `src/crm/store/useCrmStore.test.ts`: add cases confirming (a) `hydrate`
  with a `viewingUserId` sets it in the store and calls
  `dataService.load` with it; (b) a mutation after that hydrate calls
  `dataService.save` with the same `viewingUserId` as its third argument;
  (c) `hydrated` is `false` synchronously right after calling `hydrate`
  again (before its promise resolves), proving the gate closes before the
  network call — this is the specific race this design closes.
- `src/components/team/TeamView.test.tsx`: add a case that changing a
  teammate's role calls `setUserRole` with the right id/role and reloads;
  a case confirming the role `Select` is disabled on the signed-in user's
  own row.
- No new backend route tests — this repo has no route-level test
  coverage for any existing endpoint, and this spec doesn't change that
  convention. The 404/403 branches in `crm.js`'s two handlers are simple
  enough to review by reading, consistent with how every other route in
  this file is already verified.

## Out of Scope

- Renaming the `UserRole` enum values themselves.
- Any UI or behavior for the `VIEWER` role — it stays fully unused.
- Audit logging of which manager viewed/edited which teammate's CRM data.
- Persisting "view as" across a page refresh or as a URL/hash parameter —
  it deliberately resets to "My leads" on every fresh mount of the CRM
  tab, which is the safer default.
- Any change to `OpportunitiesView.tsx` / `RetailView.tsx` — confirmed via
  grep that nothing imports either file; they are dead code, unrelated to
  this work.
