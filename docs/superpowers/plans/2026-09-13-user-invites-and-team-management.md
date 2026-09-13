# User Invites & Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static shared invite code with per-email, revocable, expiring invites, and add an admin-only "Team" tab to send invites and activate/deactivate accounts.

**Architecture:** The backend reuses the exact hashed-token pattern the forgot-password flow already implements (raw token emailed, SHA-256 hash stored) for a new `Invite` model, and adds an `isActive` flag to `User` enforced at the one place every authenticated request already re-reads the user from the database. The frontend adds one new component (`TeamView`) reachable via a new sidebar tab, and removes the now-superseded invite-link section from the existing Manager Settings modal.

**Tech Stack:** React 19 + TypeScript + Vite (frontend), Express + Prisma + PostgreSQL (backend, CommonJS). Both frontend and backend tests run under the same root Vitest config (`vite.config.ts`'s `test.include` covers both `src/**/*.test.{ts,tsx}` and `functions/src/**/*.test.js`).

**Spec:** `docs/superpowers/specs/2026-09-13-user-invites-and-team-management-design.md`

## Global Constraints

- Production deploy runs `npx prisma db push --accept-data-loss` on every boot (`functions/start.sh`), **not** `prisma migrate deploy`. Editing `functions/prisma/schema.prisma` is what makes a schema change live — nothing in `prisma/migrations/` is applied at runtime. `isActive Boolean @default(true)` and a new `Invite` table are both additive/safe under `db push`.
- Backend files are CommonJS (`require`/`module.exports`), matching every existing file in `functions/src/`. Backend test files use ES `import` syntax against those CommonJS exports (Vitest handles the interop) — matches the existing convention in `functions/src/lib/crmScope.js` / `crmScope.test.js`.
- This codebase's established backend testing pattern is: extract testable business logic into small pure functions in `functions/src/lib/`, unit-test those directly; Express route handlers themselves (the `req`/`res`/Prisma wiring) have no direct test coverage anywhere in this repo (confirmed: no test file exists for any of the ~15 existing routes in `functions/src/routes/`). Follow this same pattern — do not introduce a new testing convention (e.g. supertest) for this plan.
- Never let an admin deactivate or delete their own account (mirrors the existing self-delete guard already in `functions/src/routes/users.js`'s `DELETE /:id`).
- Never expose `tokenHash` (the stored SHA-256 hash) in any API response — only the raw token, which only ever exists in the emailed link, never in a Prisma `select`.
- `SignupModal.tsx` needs **no changes** — it already passes an opaque `inviteCode` string through to `register()`; only what the backend does with that string changes.

---

### Task 1: Schema — add `Invite` model and `User.isActive`

**Files:**
- Modify: `functions/prisma/schema.prisma`

**Interfaces:**
- Produces: `Invite` model (`id, email, tokenHash, invitedById, invitedBy, expiresAt, usedAt, revokedAt, createdAt`) and `User.isActive: Boolean` — consumed by every later task in this plan.

No test step — this is a schema-only change with no logic to unit test. Verification is that Prisma can still generate a client from the file.

- [ ] **Step 1: Add the `Invite` model**

In `functions/prisma/schema.prisma`, add this new model (placed after the closing `}` of `model AppSetting` and before `model ScanCorrection`, keeping the file's existing grouping-by-topic order):

```prisma
model Invite {
  id          String    @id @default(cuid())
  email       String
  // SHA-256 of the raw token. Same reasoning as User.resetToken: the raw
  // token only ever exists in the emailed link, never in the database, so a
  // DB read alone can't produce a working invite link.
  tokenHash   String    @unique
  invitedById String
  invitedBy   User      @relation(fields: [invitedById], references: [id])
  expiresAt   DateTime
  usedAt      DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([email])
  @@map("invites")
}
```

- [ ] **Step 2: Add `isActive` and the back-relation to `model User`**

In `functions/prisma/schema.prisma`, find `model User` (starts at line 18). Add `isActive` right after the existing `role` field (line 23: `role     UserRole @default(OPERATOR)`):

```prisma
  role     UserRole @default(OPERATOR)
  isActive Boolean  @default(true)
```

Add `invitesSent Invite[]` to the `// Relations` block (after line 46's `mlsLeads          MlsLead[]`):

```prisma
  mlsLeads          MlsLead[]
  invitesSent       Invite[]
```

- [ ] **Step 3: Verify Prisma can generate a client from the updated schema**

Run: `cd functions && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors. This confirms the schema is syntactically valid and the new relation is well-formed (Prisma validates relations at generate time) — it does **not** touch any database.

- [ ] **Step 4: Commit**

```bash
git add functions/prisma/schema.prisma
git commit -m "feat: add Invite model and User.isActive to the schema"
```

---

### Task 2: `inviteStatus` — pure helper + test

**Files:**
- Create: `functions/src/lib/inviteStatus.js`
- Test: `functions/src/lib/inviteStatus.test.js`

**Interfaces:**
- Consumes: an object shaped `{ usedAt: Date | null, revokedAt: Date | null, expiresAt: Date }` (matches the `Invite` model's relevant fields from Task 1).
- Produces: `inviteStatus(invite): 'pending' | 'used' | 'expired' | 'revoked'` — consumed by Task 4's `GET /api/auth/invites` route.

This is the one piece of real business logic in this feature (a 4-way priority decision), and this codebase's established pattern is to extract exactly this kind of logic into a small tested pure function rather than leaving it inline in a route handler.

- [ ] **Step 1: Write the failing test**

Create `functions/src/lib/inviteStatus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { inviteStatus } from './inviteStatus.js';

const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe('inviteStatus', () => {
  it('is pending when unused, unrevoked, and not yet expired', () => {
    expect(inviteStatus({ usedAt: null, revokedAt: null, expiresAt: future })).toBe('pending');
  });

  it('is used once redeemed, even if it would otherwise still be pending', () => {
    expect(inviteStatus({ usedAt: new Date(), revokedAt: null, expiresAt: future })).toBe('used');
  });

  it('is expired once past its expiry, if not used or revoked', () => {
    expect(inviteStatus({ usedAt: null, revokedAt: null, expiresAt: past })).toBe('expired');
  });

  it('is revoked when revoked, even if also expired', () => {
    expect(inviteStatus({ usedAt: null, revokedAt: new Date(), expiresAt: past })).toBe('revoked');
  });

  it('prioritizes revoked over used', () => {
    // Shouldn't happen in practice (revoking a used invite is a no-op the
    // route layer avoids), but the priority order must still be well-defined.
    expect(inviteStatus({ usedAt: new Date(), revokedAt: new Date(), expiresAt: future })).toBe('revoked');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/src/lib/inviteStatus.test.js`
Expected: FAIL — `Cannot find module './inviteStatus.js'`

- [ ] **Step 3: Implement**

Create `functions/src/lib/inviteStatus.js`:

```js
/**
 * Derives an Invite row's display status. Revoked beats used beats expired
 * beats pending — an admin's explicit revoke should always be the visible
 * truth, even for an invite that (implausibly) also has a usedAt or is past
 * its expiresAt.
 */
function inviteStatus({ usedAt, revokedAt, expiresAt }) {
  if (revokedAt) return 'revoked';
  if (usedAt) return 'used';
  if (new Date(expiresAt) < new Date()) return 'expired';
  return 'pending';
}

module.exports = { inviteStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/src/lib/inviteStatus.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/inviteStatus.js functions/src/lib/inviteStatus.test.js
git commit -m "feat: add inviteStatus pure helper for deriving an invite's display status"
```

---

### Task 3: Enforce `isActive` in `authenticateToken`

**Files:**
- Modify: `functions/src/middleware/auth.js`

**Interfaces:**
- Consumes: `User.isActive` (Task 1).
- Produces: every authenticated request now 403s with `{ error: 'This account has been deactivated' }` for a deactivated user — this is the enforcement point every other route in the app already depends on transitively (they all use `authenticateToken`).

This file gates every authenticated request in the app — keep the diff to exactly the two lines below, nothing else in this file changes.

No dedicated test file — this route middleware has no existing test coverage anywhere in this codebase (see Global Constraints), and adding one here would mean standing up request-mocking infrastructure this repo doesn't use. Verification is: the full suite stays green (nothing currently covers this file, so nothing can newly fail), and a Node syntax/require smoke-check.

- [ ] **Step 1: Add `isActive` to the `select` and check it**

In `functions/src/middleware/auth.js`, `authenticateToken` currently reads (lines 30-39):

```js
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
```

Change to:

```js
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated' });
    }
```

- [ ] **Step 2: Smoke-check the file still loads**

Run: `node -e "require('./functions/src/middleware/auth.js')"`
Expected: no output, exit code 0 (confirms no syntax error — this file has no Prisma connection at require-time, so this is safe to run without a database).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (this file has no direct test coverage today, so this just confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add functions/src/middleware/auth.js
git commit -m "feat: reject requests from deactivated accounts in authenticateToken"
```

---

### Task 4: `auth.js` — per-email invites, register rewrite, login enforcement

**Files:**
- Modify: `functions/src/routes/auth.js`

**Interfaces:**
- Consumes: `Invite` model (Task 1), `inviteStatus` from `functions/src/lib/inviteStatus.js` (Task 2).
- Produces: `POST /api/auth/invites`, `GET /api/auth/invites`, `DELETE /api/auth/invites/:id` — consumed by Task 6's frontend `createInvite`/`getInvites`/`revokeInvite`. `POST /api/auth/register` now validates against a per-invite token instead of the static `INVITE_CODE` env var. `GET /api/auth/invite-link` is removed.

No dedicated test file, for the same reason as Task 3 (no existing route-level test coverage in this codebase to extend). Verification is a full-suite run plus a require smoke-check.

- [ ] **Step 1: Import the new helper**

In `functions/src/routes/auth.js`, add to the existing top imports (after line 14's `const { sendEmail } = require('../lib/emailService');`):

```js
const { inviteStatus } = require('../lib/inviteStatus');
```

- [ ] **Step 2: Add the `isActive` check to login**

In `functions/src/routes/auth.js`'s `POST /login` handler, the password check currently reads (lines 133-137):

```js
      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
```

Add immediately after it, before the JWT is generated:

```js

      if (!user.isActive) {
        return res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' });
      }
```

- [ ] **Step 3: Rewrite the invite-code check in `register`**

In `functions/src/routes/auth.js`'s `POST /register` handler, replace (lines 44-47):

```js
      // Verify invite code
      if (!process.env.INVITE_CODE || inviteCode !== process.env.INVITE_CODE) {
        return res.status(403).json({ error: 'Invalid invite code' });
      }
```

with:

```js
      // Verify invite code — a per-email, single-use, expiring Invite row,
      // looked up by the SHA-256 hash of the raw token in the link (the raw
      // token itself is never stored, same pattern as password-reset tokens
      // below).
      const inviteTokenHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
      const invite = await prisma.invite.findUnique({ where: { tokenHash: inviteTokenHash } });

      if (!invite || invite.revokedAt || invite.usedAt || invite.expiresAt < new Date()) {
        return res.status(403).json({ error: 'This invite link is invalid, expired, or has already been used' });
      }
```

`crypto` is already imported at the top of this file (line 9, used by the forgot-password flow below).

- [ ] **Step 4: Stamp the invite as used after the user is created**

Still in `POST /register`, the handler creates the user then signs a JWT (lines 70-92, unchanged). Immediately after the existing `prisma.user.create({...})` call and before the `const token = jwt.sign(...)` line, add:

```js

      await prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
```

- [ ] **Step 5: Replace the `GET /invite-link` route with the three new invite routes**

In `functions/src/routes/auth.js`, find and delete this entire block (lines 345-357):

```js
// ============================================================================
// INVITE LINK (ADMIN only)
// ============================================================================

// Lets an admin copy a shareable signup link without having to go dig the
// shared invite code out of Railway's env vars themselves.
router.get('/invite-link', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  if (!process.env.INVITE_CODE) {
    return res.status(500).json({ error: 'INVITE_CODE is not configured on the server' });
  }
  const inviteCode = process.env.INVITE_CODE;
  res.json({ inviteCode, signupUrl: `${FRONTEND_URL}/#signup=${encodeURIComponent(inviteCode)}` });
});
```

Replace it with:

```js
// ============================================================================
// INVITES (ADMIN only)
// ============================================================================

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many invites sent. Wait a while and try again.' }
});

router.post('/invites',
  authenticateToken,
  requireRole('ADMIN'),
  inviteLimiter,
  [body('email').isEmail().normalizeEmail().withMessage('Invalid email address')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { email } = req.body;
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await prisma.invite.create({
        data: { email, tokenHash, invitedById: req.user.id, expiresAt },
        select: { id: true, email: true, expiresAt: true, createdAt: true },
      });

      const signupUrl = `${FRONTEND_URL}/#signup=${rawToken}`;
      try {
        await sendEmail({
          to: [email],
          subject: "You're invited to Bexar CRE Acquisition CRM",
          text: `${req.user.username} has invited you to join the team.\n\n${signupUrl}\n\nThis link expires in 7 days and can only be used once.`,
        });
      } catch (emailError) {
        // The invite row is already saved; a failed send just means this
        // particular email didn't go out. The admin can see it's still
        // "pending" on the Team tab and re-invite the same address if needed.
        console.error('[AUTH] Failed to send invite email:', emailError);
      }

      res.status(201).json({ success: true, invite });
    } catch (error) {
      console.error('[AUTH] Create invite error:', error);
      res.status(500).json({ error: 'Failed to send invite' });
    }
  }
);

router.get('/invites', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        invitedBy: { select: { username: true } },
      },
    });

    res.json({
      invites: invites.map((invite) => ({ ...invite, status: inviteStatus(invite) })),
    });
  } catch (error) {
    console.error('[AUTH] List invites error:', error);
    res.status(500).json({ error: 'Failed to load invites' });
  }
});

router.delete('/invites/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.invite.update({
      where: { id: req.params.id },
      data: { revokedAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Invite not found' });
    }
    console.error('[AUTH] Revoke invite error:', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});
```

- [ ] **Step 6: Smoke-check the file still loads**

Run: `node -e "require('./functions/src/routes/auth.js')"`
Expected: no output, exit code 0.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add functions/src/routes/auth.js
git commit -m "feat: replace the static invite code with per-email, revocable invites"
```

---

### Task 5: `users.js` — expose and gate `isActive`

**Files:**
- Modify: `functions/src/routes/users.js`

**Interfaces:**
- Consumes: `User.isActive` (Task 1).
- Produces: `GET /api/users` now returns `isActive` per user; `PUT /api/users/:id` accepts `isActive` in its body, admin-gated, self-deactivation blocked — consumed by Task 6's frontend `getUsers`/`setUserActive`.

- [ ] **Step 1: Add `isActive` to the `GET /` select**

In `functions/src/routes/users.js`, the `GET /` handler's `select` currently reads (lines 24-38):

```js
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              assignedTasks: true,
              createdTasks: true,
              notes: true
            }
          }
        },
```

Add `isActive: true,` after `role: true,`:

```js
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              assignedTasks: true,
              createdTasks: true,
              notes: true
            }
          }
        },
```

- [ ] **Step 2: Validate and gate `isActive` in `PUT /:id`**

In `functions/src/routes/users.js`, the `PUT /:id` handler's validation chain currently reads (lines 102-106):

```js
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('role').optional().isIn(['ADMIN', 'OPERATOR', 'VIEWER'])
  ],
```

Add an `isActive` validator:

```js
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('role').optional().isIn(['ADMIN', 'OPERATOR', 'VIEWER']),
    body('isActive').optional().isBoolean()
  ],
```

Then, in the same handler, the existing role-change gate reads (lines 122-125):

```js
      // Only admins can change roles
      if (updates.role && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change user roles' });
      }
```

Add the matching `isActive` gates right after it:

```js

      // Only admins can change account status
      if (updates.isActive !== undefined && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can change account status' });
      }
      if (updates.isActive === false && req.user.id === id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }
```

Finally, add `isActive: true` to the handler's response `select` (lines 135-141):

```js
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          updatedAt: true
        }
```

- [ ] **Step 3: Smoke-check the file still loads**

Run: `node -e "require('./functions/src/routes/users.js')"`
Expected: no output, exit code 0.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/routes/users.js
git commit -m "feat: expose isActive on the users API, gated to admins"
```

---

### Task 6: Frontend `api.ts` — invite and team-member functions

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: the routes from Tasks 4 and 5.
- Produces: `createInvite(email)`, `getInvites()`, `revokeInvite(id)`, `getUsers()`, `setUserActive(id, isActive)`, plus exported types `TeamInvite` and `TeamMember` — consumed by Task 7's `TeamView.tsx`. Removes `getInviteLink` — consumed (i.e., no longer consumed) by Task 9's `ManagerViewDialog.tsx` cleanup.

- [ ] **Step 1: Remove `getInviteLink`**

In `src/lib/api.ts`, delete this function (around line 843):

```ts
export async function getInviteLink(): Promise<{ inviteCode: string; signupUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/invite-link`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to load the invite link');
  }

  return response.json();
}
```

- [ ] **Step 2: Add the invite and team-member functions**

In `src/lib/api.ts`, add this in its place (same location the deleted function occupied):

```ts
export interface TeamInvite {
  id: string;
  email: string;
  status: 'pending' | 'used' | 'expired' | 'revoked';
  invitedBy: { username: string };
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export async function createInvite(email: string): Promise<{ success: true; invite: { id: string; email: string; expiresAt: string; createdAt: string } }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to send invite');
  }
  return response.json();
}

export async function getInvites(): Promise<{ invites: TeamInvite[] }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/invites`, { headers: getAuthHeaders() });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to load invites');
  }
  return response.json();
}

export async function revokeInvite(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/invites/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to revoke invite');
  }
}

export interface TeamMember {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  isActive: boolean;
  createdAt: string;
}

export async function getUsers(): Promise<{ users: TeamMember[] }> {
  const response = await fetch(`${API_BASE_URL}/api/users`, { headers: getAuthHeaders() });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to load team members');
  }
  return response.json();
}

// The PUT /api/users/:id response shape (Task 5's route select) — deliberately
// not typed as TeamMember, since the backend returns updatedAt here, not
// createdAt. TeamView doesn't use this return value (it reloads via
// getUsers() after every mutation instead), but the type should still
// describe what the endpoint actually sends back.
interface UpdatedTeamMember {
  id: string;
  username: string;
  email: string;
  role: TeamMember['role'];
  isActive: boolean;
  updatedAt: string;
}

export async function setUserActive(id: string, isActive: boolean): Promise<UpdatedTeamMember> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ isActive }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update account status');
  }
  return response.json();
}
```

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test`
Expected: all tests pass (this file has no dedicated test suite of its own; the check is that nothing else broke, e.g. no other file imports `getInviteLink`).

Run: `npm run build`
Expected: succeeds — this specifically confirms no remaining reference to the deleted `getInviteLink` anywhere in the frontend (a leftover import would be a build failure).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add invite/team-member API functions, remove getInviteLink"
```

---

### Task 7: `TeamView.tsx` — the new tab's content

**Files:**
- Create: `src/components/team/TeamView.tsx`
- Test: `src/components/team/TeamView.test.tsx`

**Interfaces:**
- Consumes: `createInvite`, `getInvites`, `revokeInvite`, `getUsers`, `setUserActive`, `TeamInvite`, `TeamMember` (Task 6); `pillClass` from `src/lib/pillBadge.ts` (existing, already used by Contacts/Eviction/MLS); `useAuth` from `@/contexts/AuthContext` (existing).
- Produces: `TeamView` (default export) — consumed by Task 8's `Index.tsx` wiring.

- [ ] **Step 1: Write the failing test**

Create `src/components/team/TeamView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamView from './TeamView';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', username: 'raul', role: 'ADMIN' } }),
}));

const mockInvites = vi.fn();
const mockUsers = vi.fn();
const mockCreateInvite = vi.fn();
const mockRevokeInvite = vi.fn();
const mockSetUserActive = vi.fn();

vi.mock('@/lib/api', () => ({
  getInvites: () => mockInvites(),
  getUsers: () => mockUsers(),
  createInvite: (email: string) => mockCreateInvite(email),
  revokeInvite: (id: string) => mockRevokeInvite(id),
  setUserActive: (id: string, isActive: boolean) => mockSetUserActive(id, isActive),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  mockInvites.mockResolvedValue({
    invites: [
      { id: 'inv1', email: 'new@example.com', status: 'pending', invitedBy: { username: 'raul' }, createdAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-08T00:00:00.000Z', usedAt: null, revokedAt: null },
    ],
  });
  mockUsers.mockResolvedValue({
    users: [
      { id: 'me', username: 'raul', email: 'raul@example.com', role: 'ADMIN', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'OPERATOR', isActive: true, createdAt: '2026-02-01T00:00:00.000Z' },
    ],
  });
});

describe('TeamView', () => {
  it('lists pending invites and team members after loading', async () => {
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeTruthy());
    expect(screen.getByText('pending')).toBeTruthy();
    expect(screen.getByText('luciano')).toBeTruthy();
  });

  it('sends an invite and refreshes the list', async () => {
    const user = userEvent.setup();
    mockCreateInvite.mockResolvedValue({ success: true, invite: { id: 'inv2', email: 'second@example.com', expiresAt: '2026-09-08T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' } });
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeTruthy());

    await user.type(screen.getByLabelText(/email/i), 'second@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledWith('second@example.com'));
    expect(mockInvites).toHaveBeenCalledTimes(2); // initial load + refresh after send
  });

  it('revokes a pending invite', async () => {
    const user = userEvent.setup();
    mockRevokeInvite.mockResolvedValue(undefined);
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /revoke/i }));
    await waitFor(() => expect(mockRevokeInvite).toHaveBeenCalledWith('inv1'));
  });

  it('toggles a teammate to inactive, but disables the toggle for the signed-in admin', async () => {
    const user = userEvent.setup();
    mockSetUserActive.mockResolvedValue({ id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'OPERATOR', isActive: false, createdAt: '2026-02-01T00:00:00.000Z' });
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('luciano')).toBeTruthy());

    const deactivateButton = screen.getByRole('button', { name: /deactivate luciano/i });
    await user.click(deactivateButton);
    await waitFor(() => expect(mockSetUserActive).toHaveBeenCalledWith('u2', false));

    expect(screen.getByRole('button', { name: /deactivate raul/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/team/TeamView.test.tsx`
Expected: FAIL — `Cannot find module './TeamView'`

- [ ] **Step 3: Implement**

Create `src/components/team/TeamView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { pillClass } from '@/lib/pillBadge';
import {
  createInvite,
  getInvites,
  getUsers,
  revokeInvite,
  setUserActive,
  type TeamInvite,
  type TeamMember,
} from '@/lib/api';

const INVITE_STATUS_TONE: Record<TeamInvite['status'], string> = {
  pending: 'warn',
  used: 'success',
  expired: 'grey',
  revoked: 'danger',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TeamView() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    const [invitesRes, usersRes] = await Promise.all([getInvites(), getUsers()]);
    setInvites(invitesRes.invites);
    setMembers(usersRes.users);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => {
        toast({ title: 'Failed to load team data', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      await createInvite(email.trim());
      setEmail('');
      toast({ title: 'Invite sent' });
      await load();
    } catch (err) {
      toast({ title: 'Failed to send invite', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeInvite(id);
      await load();
    } catch (err) {
      toast({ title: 'Failed to revoke invite', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setRevokingId(null);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    setTogglingId(member.id);
    try {
      await setUserActive(member.id, !member.isActive);
      await load();
    } catch (err) {
      toast({ title: 'Failed to update account status', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">Invite new teammates and manage who has access.</p>
      </div>

      <section className="space-y-3 rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-medium">Invite a teammate</h2>
        <form onSubmit={handleSendInvite} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <Button type="submit" disabled={sending || !email.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Send Invite
          </Button>
        </form>

        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Invited By</th>
                <th className="px-4 py-2 text-left font-medium">Sent</th>
                <th className="px-4 py-2 text-left font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-t">
                  <td className="px-4 py-2">{invite.email}</td>
                  <td className="px-4 py-2">
                    <span className={pillClass(INVITE_STATUS_TONE[invite.status])}>{invite.status}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{invite.invitedBy.username}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(invite.createdAt)}</td>
                  <td className="px-4 py-2">
                    {invite.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokingId === invite.id}
                        onClick={() => handleRevoke(invite.id)}
                      >
                        {revokingId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revoke'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No invites yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-medium">Team members</h2>
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Joined</th>
                <th className="px-4 py-2 text-left font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.id === user?.id;
                return (
                  <tr key={member.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{member.username}</td>
                    <td className="px-4 py-2 text-muted-foreground">{member.email}</td>
                    <td className="px-4 py-2 text-muted-foreground">{member.role}</td>
                    <td className="px-4 py-2">
                      <span className={pillClass(member.isActive ? 'success' : 'grey')}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSelf || togglingId === member.id}
                        title={isSelf ? "You can't deactivate your own account" : undefined}
                        aria-label={member.isActive ? `Deactivate ${member.username}` : `Activate ${member.username}`}
                        onClick={() => handleToggleActive(member)}
                      >
                        {togglingId === member.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : member.isActive ? (
                          'Deactivate'
                        ) : (
                          'Activate'
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/team/TeamView.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/team/TeamView.tsx src/components/team/TeamView.test.tsx
git commit -m "feat: add TeamView with invite management and activate/deactivate"
```

---

### Task 8: Wire the "Team" tab into navigation

**Files:**
- Modify: `src/components/layout/navItems.ts`, `src/components/layout/Sidebar.tsx`, `src/components/layout/TopBar.tsx`, `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `TeamView` (Task 7, default export from `@/components/team/TeamView`).
- Produces: `'team'` added to the `TabType` union — no later task depends on this, it's the final piece of the visible feature.

- [ ] **Step 1: Add `'team'` to `TabType`**

In `src/components/layout/navItems.ts`, change (line 3-5):

```ts
export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'crm' | 'evictions' | 'mls' | 'inbox';
```

to:

```ts
export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'crm' | 'evictions' | 'mls' | 'inbox' | 'team';
```

Do **not** add `'team'` to the `tabs` array (lines 7-17) or anywhere `manageableNavItems` reads from — it's admin-only and must not be hideable via the tab-visibility settings, the same treatment the existing "Settings" entry already gets (a special-cased Sidebar/TopBar button, not a data-driven tab).

- [ ] **Step 2: Add the Sidebar button**

In `src/components/layout/Sidebar.tsx`, add `Users` to the existing lucide-react import (line 1):

```ts
import { Building2, ChevronDown, FileText, LogOut, Settings, Upload, Users } from 'lucide-react'
```

Add a new admin-only button immediately before the existing "Settings" button (before line 95's `{isAdmin && (`):

```tsx
        {isAdmin && (
          <li>
            <button type="button" onClick={() => onTabChange('team')} className={itemClasses(activeTab === 'team')}>
              <Users className="h-[18px] w-[18px] shrink-0" />
              Team
            </button>
          </li>
        )}
```

- [ ] **Step 3: Add the TopBar mobile-menu button**

In `src/components/layout/TopBar.tsx`, add `Users` to the existing lucide-react import (line 2):

```ts
import { Bell, FileText, LogOut, Menu, RefreshCw, Search, Settings, Upload, Users, X } from 'lucide-react'
```

Add a new admin-only button immediately before the existing "Manager Settings" button (before line 179's `{isAdmin && (`):

```tsx
                {isAdmin && (
                  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('team') }}>
                    <Users className="h-5 w-5 mr-3" />
                    Team
                  </Button>
                )}
```

- [ ] **Step 4: Wire the route in `Index.tsx`**

In `src/pages/Index.tsx`, add the import alongside the other view imports (after line 15's `import InboxView from '@/components/inbox/InboxView';`):

```ts
import TeamView from '@/components/team/TeamView';
```

Add `'team'` to `getInitialTab()`'s `validTabs` array (line 31):

```ts
  const validTabs: TabType[] = ['dashboard', 'calendar', 'properties', 'tasks', 'upload', 'files', 'preforeclosure', 'crm', 'driving', 'evictions', 'mls', 'inbox', 'team'];
```

Add a case to `renderContent()`'s switch, alongside the other `case` entries (matches the existing pattern seen at `Index.tsx:150-159`):

```tsx
      case 'team':
        return <TeamView />;
```

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: all tests pass, including `Sidebar.test.tsx`. That file's default test props mock `useAuth` with `role: 'OPERATOR'`, so the new admin-gated Team button won't even render during those tests, and its one button-count assertion already uses `toBeGreaterThanOrEqual`, not an exact count — neither is affected by this task's addition.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/navItems.ts src/components/layout/Sidebar.tsx src/components/layout/TopBar.tsx src/pages/Index.tsx
git commit -m "feat: add an admin-only Team tab to the sidebar and mobile menu"
```

---

### Task 9: Remove the superseded invite section from `ManagerViewDialog.tsx`

**Files:**
- Modify: `src/components/layout/ManagerViewDialog.tsx`

**Interfaces:**
- Consumes: nothing new (this task only removes code that called the now-deleted `getInviteLink` from Task 6).

- [ ] **Step 1: Remove the invite-related state and effect**

In `src/components/layout/ManagerViewDialog.tsx`, remove these four state lines (lines 29-32):

```ts
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState(false);
  const [copied, setCopied] = useState(false);
```

In the `useEffect` (lines 34-55), remove the invite-loading block (lines 49-54):

```ts
    setInviteLoading(true);
    setInviteError(false);
    getInviteLink()
      .then((data) => setInviteLink(data.signupUrl))
      .catch(() => setInviteError(true))
      .finally(() => setInviteLoading(false));
```

leaving the `useEffect` with only the `getHiddenTabs()` block that was already there above it.

- [ ] **Step 2: Remove `handleCopyInvite` and the `getInviteLink` import**

Remove the `handleCopyInvite` function (lines 85-90):

```ts
  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
```

Change the import line (line 9) from:

```ts
import { getHiddenTabs, setHiddenTabs as saveHiddenTabs, getInviteLink } from '@/lib/api';
```

to:

```ts
import { getHiddenTabs, setHiddenTabs as saveHiddenTabs } from '@/lib/api';
```

Also remove `Copy, Check` from the lucide-react import (line 7) if nothing else in the file uses them — check first with a search within this file; if either is still referenced elsewhere, leave that one in place. Based on the file as described in the spec, neither is used anywhere else, so the import becomes:

```ts
import { Loader2, Settings } from 'lucide-react';
```

- [ ] **Step 3: Remove the "Invite a teammate" JSX section**

Remove this entire `<section>` (originally lines 138-162):

```tsx
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Invite a teammate</h3>
            <p className="text-xs text-muted-foreground">Anyone with this link can create an account.</p>
            {inviteLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : inviteLink ? (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" size="icon" variant="outline" onClick={handleCopyInvite} title="Copy invite link">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-destructive">
                {inviteError ? "Couldn't load the invite link." : 'No invite link available.'}
              </p>
            )}
          </section>
```

`Input` (from `@/components/ui/input`, originally imported at line 6:
`import { Input } from '@/components/ui/input';`) was only ever used inside
the section just removed — the "Visible tabs" section above it uses
`Checkbox`/`Label`, not `Input`. Remove the `Input` import line entirely.

- [ ] **Step 4: Update the dialog's description text**

Change (originally line 101):

```tsx
            Control what the whole team sees, and invite new teammates.
```

to:

```tsx
            Control what the whole team sees.
```

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: succeeds — confirms no dangling reference to any removed import or the deleted `getInviteLink`.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ManagerViewDialog.tsx
git commit -m "refactor: remove the superseded invite-link section from Manager Settings"
```

---

## Final verification

- [ ] Run `npm run lint` — expected: no new lint errors introduced by this plan's files.
- [ ] Run `npm test` — expected: full suite green.
- [ ] Run `npm run build` — expected: succeeds.
- [ ] After deploy, manually verify end-to-end (no automated route-level tests exist for this — see Global Constraints): as an ADMIN, open the new Team tab, send an invite to a real test email, confirm the email arrives via Brevo, open the link in an incognito window, confirm the signup form pre-fills and account creation works with a chosen password, confirm the invite now shows "used" on the Team tab, then deactivate that new test account and confirm it can no longer log in (should see "This account has been deactivated").
