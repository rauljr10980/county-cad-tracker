# Per-User CRM Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the CRM tab's records to their owner so each user sees only their own, and close the `PUT /api/crm/state` delete that currently lets any account wipe every account's CRM data.

**Architecture:** Ownership lives on `CrmLead` alone — `CrmDeal`, `CrmTask`, and `CrmActivity` each hang off a required `leadId` with `onDelete: Cascade`, so they are scoped through the relation. The where-clause builders and the empty-payload rule go in a dependency-free module so they can be unit tested; `functions/src/routes/crm.js` cannot be imported in the test environment because `new PrismaClient()` eagerly loads a native engine binary.

**Tech Stack:** Express (CommonJS), Prisma 5.22.0, PostgreSQL on Railway, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-per-user-crm-isolation-design.md`

## Global Constraints

- **Strict isolation.** Every user sees only their own CRM records, `ADMIN` included. No role check, no cross-user view.
- **Ownership on `CrmLead` only.** Do not add `userId` to `CrmDeal`, `CrmTask`, or `CrmActivity`.
- **`userId` is nullable in the schema.** Railway runs `prisma db push --accept-data-loss`; a required column with no default fails against a populated table. It is always set in application code.
- **Backfill assigns null-owner leads to the oldest account**, runs in `functions/start.sh`, is idempotent, and is a no-op when the users table is empty.
- **The backfill must live in `start.sh`, not in `prisma/migrations/`.** This project never runs `prisma migrate deploy` — `start.sh` runs `db push`, which executes nothing in `migrations/`.
- **The empty-payload guard returns `409`** and triggers on the **lead count alone**. A payload with leads but zero deals/tasks/activities is legitimate and must pass through.
- Backend is CommonJS. No new dependencies.
- **There is no local database.** Never run `prisma migrate deploy`, `prisma migrate dev`, or `prisma db push`. `prisma validate` and `prisma generate` need a `DATABASE_URL`; a dummy value like `postgresql://u:p@localhost:5432/db` works and does not connect.
- Backend tests live at `functions/src/**/*.test.js`, already collected by the Vitest config.
- Suite baseline is **70 tests across 9 files**. Build is green.
- Commit after every task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `functions/prisma/schema.prisma` | `userId` on `CrmLead`, back-relation on `User` |
| `functions/start.sh` | Idempotent backfill to the oldest account |
| `functions/src/lib/crmScope.js` | **New.** Pure where-clause builders and the empty-payload rule |
| `functions/src/lib/crmScope.test.js` | **New.** Unit tests for the above |
| `functions/src/routes/crm.js` | Both routes consume the builders; ownership guards |

---

### Task 1: Schema column and backfill

**Files:**
- Modify: `functions/prisma/schema.prisma` (`model CrmLead` at line 792, `model User` relations block at lines 28-37)
- Modify: `functions/start.sh`

**Interfaces:**
- Consumes: nothing
- Produces: `CrmLead.userId` (nullable `String`), indexed; `User.crmLeads` back-relation

- [ ] **Step 1: Add the column and relation to `CrmLead`**

In `functions/prisma/schema.prisma`, inside `model CrmLead`, add the field after `createdAt` and the index alongside the existing ones:

```prisma
  createdAt             DateTime  @default(now())
  userId                String?

  user       User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  deals      CrmDeal[]
  tasks      CrmTask[]
  activities CrmActivity[]

  @@index([kind])
  @@index([industry])
  @@index([createdAt])
  @@index([userId])
  @@map("crm_leads")
```

- [ ] **Step 2: Add the back-relation to `User`**

In `model User`, add to the relations block (after `evictionLandlords`):

```prisma
  crmLeads          CrmLead[]
```

- [ ] **Step 3: Verify the schema is valid**

```bash
cd functions
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate
```

Expected: `validate` prints that the schema is valid; `generate` prints `Generated Prisma Client`. Use the repo's pinned Prisma — if a bare `npx prisma` fetches a different version, run it through the local install.

Do NOT run `prisma db push` or any `migrate` command. There is no local database.

- [ ] **Step 4: Add the backfill to `start.sh`**

In `functions/start.sh`, after the eviction `contactStage` remap block and before `# Start the application`, add:

```sh
# Assign pre-isolation CRM leads to the oldest account.
#
# This lives here rather than in prisma/migrations/ because this script runs
# `prisma db push`, which syncs the schema and never executes anything in
# migrations/. The userId column lands via db push; this row update would not
# run at all without these lines.
#
# Idempotent: after the first run no rows have a null userId. The EXISTS guard
# makes it a no-op on an empty users table rather than writing NULL over NULL.
echo "🔄 Assigning unowned CRM leads to the oldest account..."
echo "UPDATE \"crm_leads\" SET \"userId\" = (SELECT id FROM users ORDER BY \"createdAt\" ASC LIMIT 1) WHERE \"userId\" IS NULL AND EXISTS (SELECT 1 FROM users);" | npx prisma db execute --stdin 2>/dev/null && echo "✅ CRM backfill complete" || echo "⚠️ CRM backfill skipped"
```

- [ ] **Step 5: Verify the shell script still parses**

```bash
sh -n functions/start.sh
```

Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add functions/prisma/schema.prisma functions/start.sh
git commit -m "Add userId to CrmLead and backfill unowned leads to the oldest account"
```

---

### Task 2: Scope builders and the empty-payload rule

**Files:**
- Create: `functions/src/lib/crmScope.js`
- Test: `functions/src/lib/crmScope.test.js`

**Interfaces:**
- Consumes: nothing
- Produces, all pure and dependency-free:
  - `leadWhere(userId)` → `{ userId }`
  - `childWhere(userId)` → `{ lead: { userId } }`
  - `leadDeleteWhere(userId, keepIds)` → `{ userId, id: { notIn: keepIds } }`
  - `childDeleteWhere(userId, keepIds)` → `{ lead: { userId }, id: { notIn: keepIds } }`
  - `isEmptyPayloadBlocked({ incomingLeads, existingLeads })` → `boolean`
  - `EMPTY_PAYLOAD_CODE` → `'EMPTY_PAYLOAD_GUARD'`
  - `FOREIGN_ID_CODE` → `'FOREIGN_ID'`

- [ ] **Step 1: Write the failing test**

Create `functions/src/lib/crmScope.test.js`:

```js
const { describe, it, expect } = require('vitest');
const {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
} = require('./crmScope');

describe('scope builders', () => {
  it('scopes leads by their owner', () => {
    expect(leadWhere('u1')).toEqual({ userId: 'u1' });
  });

  it('scopes children through the lead relation, not a column of their own', () => {
    expect(childWhere('u1')).toEqual({ lead: { userId: 'u1' } });
  });

  it('keeps the incoming ids and deletes the rest, within one owner', () => {
    expect(leadDeleteWhere('u1', ['a', 'b'])).toEqual({
      userId: 'u1',
      id: { notIn: ['a', 'b'] },
    });
  });

  it('scopes child deletes through the relation', () => {
    expect(childDeleteWhere('u1', ['a'])).toEqual({
      lead: { userId: 'u1' },
      id: { notIn: ['a'] },
    });
  });

  it('deletes nothing outside the owner even when the keep list is empty', () => {
    expect(leadDeleteWhere('u1', [])).toEqual({ userId: 'u1', id: { notIn: [] } });
    expect(childDeleteWhere('u1', [])).toEqual({
      lead: { userId: 'u1' },
      id: { notIn: [] },
    });
  });
});

describe('isEmptyPayloadBlocked', () => {
  it('blocks an empty payload when the account has leads', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 0, existingLeads: 12 })).toBe(true);
  });

  it('allows an empty payload when the account has no leads', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 0, existingLeads: 0 })).toBe(false);
  });

  it('allows a payload that legitimately removes some leads', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 3, existingLeads: 12 })).toBe(false);
  });

  it('allows a payload that removes all but one lead', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 1, existingLeads: 12 })).toBe(false);
  });

  it('triggers on lead count alone, ignoring empty child collections', () => {
    expect(
      isEmptyPayloadBlocked({
        incomingLeads: 2,
        existingLeads: 9,
        incomingDeals: 0,
        incomingTasks: 0,
        incomingActivities: 0,
      })
    ).toBe(false);
  });
});

describe('error codes', () => {
  it('exposes stable codes the route maps to HTTP status', () => {
    expect(EMPTY_PAYLOAD_CODE).toBe('EMPTY_PAYLOAD_GUARD');
    expect(FOREIGN_ID_CODE).toBe('FOREIGN_ID');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run functions/src/lib/crmScope.test.js
```

Expected: FAIL — `Cannot find module './crmScope'`.

- [ ] **Step 3: Write the implementation**

Create `functions/src/lib/crmScope.js`:

```js
/**
 * Where-clause builders for per-user CRM isolation, and the empty-payload rule.
 *
 * Ownership lives on CrmLead alone. CrmDeal, CrmTask, and CrmActivity each have
 * a required leadId with onDelete: Cascade, so they are scoped through the
 * relation rather than carrying a userId of their own — one column to keep
 * correct instead of four that can disagree.
 *
 * This module is dependency-free on purpose. routes/crm.js cannot be imported
 * in the test environment: it constructs a PrismaClient at require time, which
 * eagerly loads a native query-engine binary. Keeping the rules here is what
 * makes them testable.
 */

const EMPTY_PAYLOAD_CODE = 'EMPTY_PAYLOAD_GUARD';
const FOREIGN_ID_CODE = 'FOREIGN_ID';

const leadWhere = (userId) => ({ userId });

const childWhere = (userId) => ({ lead: { userId } });

const leadDeleteWhere = (userId, keepIds) => ({
  userId,
  id: { notIn: keepIds },
});

const childDeleteWhere = (userId, keepIds) => ({
  lead: { userId },
  id: { notIn: keepIds },
});

/**
 * Scoping stops one account from destroying another's data. It does not stop an
 * account from destroying its own: if the client's load fails and it then
 * autosaves an empty state, the save deletes everything the user has.
 *
 * Deliberately keyed on the lead count alone. Deals, tasks, and activities can
 * all legitimately go to zero while leads remain, so counting them here would
 * reject valid saves.
 */
const isEmptyPayloadBlocked = ({ incomingLeads, existingLeads }) =>
  incomingLeads === 0 && existingLeads > 0;

module.exports = {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run functions/src/lib/crmScope.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: 81 tests across 10 files (70 baseline + 11 new).

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/crmScope.js functions/src/lib/crmScope.test.js
git commit -m "Add per-user CRM scope builders and the empty-payload rule"
```

---

### Task 3: Scope both CRM routes

**Files:**
- Modify: `functions/src/routes/crm.js` (whole file, 147 lines)

**Interfaces:**
- Consumes from Task 2: `leadWhere`, `childWhere`, `leadDeleteWhere`, `childDeleteWhere`, `isEmptyPayloadBlocked`, `EMPTY_PAYLOAD_CODE`, `FOREIGN_ID_CODE`
- Consumes from Task 1: `CrmLead.userId`
- Produces: `GET /api/crm/state` and `PUT /api/crm/state`, both scoped to `req.user.id`

Both routes already run behind `authenticateToken`, so `req.user.id` is present.

- [ ] **Step 1: Import the builders**

At the top of `functions/src/routes/crm.js`, after the existing requires:

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

- [ ] **Step 2: Scope the GET**

Replace the four `findMany` calls in `GET /state` so each carries a `where`:

```js
    const userId = req.user.id;
    const [leads, deals, tasks, activities] = await Promise.all([
      prisma.crmLead.findMany({ where: leadWhere(userId), orderBy: { createdAt: 'asc' } }),
      prisma.crmDeal.findMany({ where: childWhere(userId), orderBy: { createdAt: 'asc' } }),
      prisma.crmTask.findMany({ where: childWhere(userId), orderBy: { dueAt: 'asc' } }),
      prisma.crmActivity.findMany({ where: childWhere(userId), orderBy: { timestamp: 'asc' } }),
    ]);
```

Leave the serializers and the `settings` block exactly as they are.

- [ ] **Step 3: Guard and scope the PUT**

In `PUT /state`, replace the opening of the transaction — everything from `await prisma.$transaction(async (tx) => {` down to and including the four `deleteMany` calls — with:

```js
  const userId = req.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      const incomingLeadIds = leads.map((l) => l.id);
      const incomingDealIds = deals.map((d) => d.id);
      const incomingTaskIds = tasks.map((t) => t.id);
      const incomingActivityIds = activities.map((a) => a.id);

      // Refuse a wipe caused by a failed load rather than a real edit.
      // Counted inside the transaction so the check and the deletes see the
      // same snapshot, and so throwing rolls back before anything is removed.
      if (leads.length === 0) {
        const existingLeads = await tx.crmLead.count({ where: leadWhere(userId) });
        if (isEmptyPayloadBlocked({ incomingLeads: 0, existingLeads })) {
          const err = new Error('Refusing to delete every lead on an empty payload');
          err.code = EMPTY_PAYLOAD_CODE;
          throw err;
        }
      }

      // Scoping the deletes stops cross-account wipes, but the upserts below
      // address rows by primary key alone. Without this check a client could
      // send another user's lead id and take ownership of that row.
      if (incomingLeadIds.length) {
        const foreign = await tx.crmLead.findMany({
          where: { id: { in: incomingLeadIds }, NOT: { userId } },
          select: { id: true },
        });
        if (foreign.length) {
          const err = new Error('Payload references leads owned by another account');
          err.code = FOREIGN_ID_CODE;
          throw err;
        }
      }

      // Delete records removed on the client, within this account only
      await tx.crmActivity.deleteMany({ where: childDeleteWhere(userId, incomingActivityIds) });
      await tx.crmTask.deleteMany({ where: childDeleteWhere(userId, incomingTaskIds) });
      await tx.crmDeal.deleteMany({ where: childDeleteWhere(userId, incomingDealIds) });
      await tx.crmLead.deleteMany({ where: leadDeleteWhere(userId, incomingLeadIds) });
```

Note the `NOT: { userId }` form rather than `userId: { not: userId }` — it also matches rows whose `userId` is null, which is what an un-backfilled row looks like.

- [ ] **Step 4: Stamp the owner on lead upserts**

In the lead upsert loop, add `userId` to both the create and the update. The `data` object stays as it is; only the `upsert` call changes:

```js
        await tx.crmLead.upsert({
          where: { id: lead.id },
          create: { id: lead.id, userId, ...data },
          update: { ...data, userId },
        });
```

Leave the deal, task, and activity upsert loops unchanged — they inherit ownership through `leadId`.

- [ ] **Step 5: Map the guard codes to HTTP status**

Replace the `catch` block at the end of `PUT /state`:

```js
  } catch (err) {
    if (err.code === EMPTY_PAYLOAD_CODE) {
      return res.status(409).json({
        error: 'Refusing to clear the CRM on an empty save. Reload and try again.',
      });
    }
    if (err.code === FOREIGN_ID_CODE) {
      return res.status(409).json({ error: 'Payload references records owned by another account' });
    }
    console.error('[CRM] PUT /state error:', err);
    res.status(500).json({ error: 'Failed to sync CRM state' });
  }
```

- [ ] **Step 6: Verify syntax and the suite**

```bash
node --check functions/src/routes/crm.js
npm test
```

Expected: `node --check` exits 0 with no output. Suite still 81 tests across 10 files — this task adds no tests, because every rule it applies was tested in Task 2 and the rest needs a live database.

- [ ] **Step 7: Read the finished PUT route end to end**

Confirm by reading, not by assuming:

1. Every `deleteMany` carries a `userId` scope — four of four.
2. The empty-payload check and the foreign-id check both run **before** the first `deleteMany`.
3. Both throw inside the transaction, so nothing is deleted when they trip.
4. The lead upsert sets `userId` on create **and** on update.
5. `GET /state` filters all four collections.

- [ ] **Step 8: Commit**

```bash
git add functions/src/routes/crm.js
git commit -m "Scope both CRM state routes to the signed-in user"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Schema: nullable `userId`, index, cascade | 1 |
| Backfill in `start.sh`, idempotent, no-op on empty users | 1 |
| `GET /state` filters leads and children | 3 |
| `PUT /state` scopes all four deletes | 3 |
| `PUT /state` stamps `userId` on creates | 3 |
| Empty-payload guard returning 409, lead count alone | 2 (rule) + 3 (wiring) |
| Strict isolation, no role check | 3 — no role is read anywhere |
| Ownership on `CrmLead` only | 1 — no other model gains a column |
| Tests under `functions/src/**/*.test.js` | 2 |

**Gap found and closed during review:** the spec describes scoping the deletes but not the upserts. `upsert` addresses rows by primary key alone, so a client sending another account's lead id would have updated — and with Step 4, re-owned — that row. Scoped deletes do not cover this. Task 3 Step 3 adds a foreign-id check, and `FOREIGN_ID_CODE` is defined in Task 2 so the two tasks agree on the constant.

**Placeholder scan:** clean. Every step names exact files, exact commands, and complete code.

**Type consistency:** the seven names Task 3 imports are the seven Task 2 exports, spelled identically. `isEmptyPayloadBlocked` takes `{ incomingLeads, existingLeads }` in both the test and the call site.

**Note on test counts:** Task 2 adds 11 tests for a total of 81. Task 3 adds none — its logic is either already covered by Task 2 or requires a live database, which this environment does not have. Do not invent database-backed tests to inflate the count.
