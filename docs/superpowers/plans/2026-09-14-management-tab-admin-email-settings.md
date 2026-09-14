# Management Tab — Admin-Editable Per-Teammate SMTP Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, admin-only "Management" tab where an ADMIN can view which teammates have configured their own SMTP credentials, and set/clear/test-send those credentials on a teammate's behalf, without ever being able to read back a stored password.

**Architecture:** Extract the self-service test-send logic into a small shared backend helper, add four new `ADMIN`-only routes in `functions/src/routes/users.js` that mirror the existing self-service `/api/email/settings` routes but scoped to any `:id`, then build a thin frontend layer (4 new `api.ts` functions, an admin-mode extension to the existing `EmailSettingsDialog.tsx`, a new `ManagementView.tsx` list, and nav wiring) that reuses the self-service dialog rather than duplicating it.

**Tech Stack:** Express + Prisma + PostgreSQL (`functions/src/`), React 19 + TypeScript + Vite (`src/`), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-management-tab-admin-email-settings-design.md`

## Global Constraints

- No Prisma schema change — `User.smtpUsername`/`smtpAppPassword` already exist.
- All new backend routes require `ADMIN` specifically via `requireRole('ADMIN')` — stricter than the existing `GET /api/users`, which also allows `OPERATOR`.
- `smtpAppPassword` must never appear in any HTTP response, in any route, under any circumstance.
- `router.get('/email-settings', ...)` in `functions/src/routes/users.js` MUST be registered before the existing `router.get('/:id', ...)` — Express matches routes in registration order, and `/:id` would otherwise swallow the literal `/email-settings` path segment as `id: "email-settings"`.
- No backend route-level tests — this repo has zero `*.test.js` files under `functions/src/routes/` by established convention. Verify new routes by reading the code and a manual syntax check (`node -c`), not by writing route tests.
- The Team tab (`src/components/team/TeamView.tsx`) is completely unchanged by this plan.
- The admin's own row in the Management roster gets NO self-editing restriction (no `isSelf`-disabled controls like `TeamView.tsx` uses for role/activate-deactivate) — editing your own SMTP credentials via the admin route has the same effect and risk as the self-service dialog you already have.
- Work happens directly on `main` (small additive feature, no schema change, matching the last several changes this session).

---

### Task 1: Backend — extract shared test-send helper, refactor self-service route to use it

**Files:**
- Create: `functions/src/lib/sendTestEmail.js`
- Modify: `functions/src/routes/email.js:6` (import line), `functions/src/routes/email.js:145-155` (inner try block of `POST /test`)

**Interfaces:**
- Produces: `sendTestEmailWith({ smtpUsername, smtpAppPassword, to })` — async function, exported from `functions/src/lib/sendTestEmail.js` as `{ sendTestEmailWith }`. Sends one fixed-copy test email using the given credential pair to `to`. Resolves the same way `sendEmailSmtp` resolves; rejects the same way `sendEmailSmtp` rejects (it is a thin pass-through). Task 2 imports and calls this directly.

- [ ] **Step 1: Create the shared helper**

Create `functions/src/lib/sendTestEmail.js`:

```js
const { sendEmailSmtp } = require('./emailService');

/**
 * Sends a one-off test message using a specific SMTP credential pair.
 * Shared by the self-service POST /api/email/test (the caller's own
 * credentials) and the admin-only POST /api/users/:id/email-settings/test
 * (a teammate's credentials, set by an admin).
 */
async function sendTestEmailWith({ smtpUsername, smtpAppPassword, to }) {
  return sendEmailSmtp({
    to: [to],
    subject: 'Test email from Bexar CRE Acquisition CRM',
    text: 'If you got this, your email is set up correctly.',
    auth: { user: smtpUsername, pass: smtpAppPassword },
  });
}

module.exports = { sendTestEmailWith };
```

This is a branchless, single-call wrapper around the already-tested `sendEmailSmtp` — it has no logic of its own to unit test. Verification is the manual check in Step 2 plus Task 2's route-level manual smoke test, not a dedicated test file.

- [ ] **Step 2: Verify the module loads and exports correctly**

Run: `node -e "const { sendTestEmailWith } = require('./functions/src/lib/sendTestEmail'); console.log(typeof sendTestEmailWith === 'function' ? 'OK' : 'FAIL')"`

Expected: prints `OK`. (This only checks the module resolves and the export shape is correct — it does not send a real email, since `GMAIL_USER`/`GMAIL_APP_PASSWORD` aren't set in the local shell. That's fine; Task 2's smoke test against the running app is the real send-path check.)

- [ ] **Step 3: Refactor `functions/src/routes/email.js` to use the shared helper**

Replace line 6:

```js
const { sendEmail, sendEmailSmtp } = require('../lib/emailService');
```

with:

```js
const { sendEmail } = require('../lib/emailService');
const { sendTestEmailWith } = require('../lib/sendTestEmail');
```

Replace lines 145-155 (the inner `try`/`catch` inside `POST /test`, currently calling `sendEmailSmtp` directly):

```js
      try {
        await sendEmailSmtp({
          to: [recipient],
          subject: 'Test email from Bexar CRE Acquisition CRM',
          text: 'If you got this, your email is set up correctly.',
          auth: { user: user.smtpUsername, pass: user.smtpAppPassword },
        });
        res.json({ success: true });
      } catch (err) {
        res.status(200).json({ success: false, error: String(err.message || err) });
      }
```

with:

```js
      try {
        await sendTestEmailWith({ smtpUsername: user.smtpUsername, smtpAppPassword: user.smtpAppPassword, to: recipient });
        res.json({ success: true });
      } catch (err) {
        res.status(200).json({ success: false, error: String(err.message || err) });
      }
```

Nothing else in `email.js` changes — `sendEmail` (still imported) is still used by `POST /send`, unchanged.

- [ ] **Step 4: Syntax-check the modified file**

Run: `node -c functions/src/routes/email.js`

Expected: no output, exit code 0 (no syntax errors).

- [ ] **Step 5: Run the full test suite to confirm nothing broke**

Run: `npx vitest run src/components/layout/EmailSettingsDialog.test.tsx`

Expected: all 5 existing tests still pass — this file's mocked `sendTestEmail` call goes through the same `POST /test` route, now internally calling the extracted helper, but the route's request/response contract is unchanged.

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/sendTestEmail.js functions/src/routes/email.js
git commit -m "refactor: extract shared test-send helper for reuse by the admin Management tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — admin-only routes for viewing and managing any teammate's SMTP settings

**Files:**
- Modify: `functions/src/routes/users.js` (add imports near the top; add one new collection route between the existing `GET /` block and `GET /:id` block; add three new `:id`-scoped routes after the existing `DELETE /:id` block, before `module.exports`)

**Interfaces:**
- Consumes: `sendTestEmailWith({ smtpUsername, smtpAppPassword, to })` from Task 1 (`functions/src/lib/sendTestEmail.js`).
- Produces (for Task 3's frontend `api.ts` functions to call):
  - `GET /api/users/email-settings` → `200 { users: Array<{ id, username, email, role, smtpUsername, smtpConfigured }> }`
  - `PUT /api/users/:id/email-settings` body `{ smtpUsername, smtpAppPassword }` → `200 { smtpConfigured: true, smtpUsername }` / `400` validation error / `404` user not found
  - `DELETE /api/users/:id/email-settings` → `200 { smtpConfigured: false }` / `404` user not found
  - `POST /api/users/:id/email-settings/test` body `{ to? }` → `200 { success: true }` / `200 { success: false, error }` (SMTP send failure) / `400` not configured or bad `to` / `404` user not found / `429` rate-limited

- [ ] **Step 1: Add new imports**

In `functions/src/routes/users.js`, after the existing `const prisma = require('../lib/prisma');` line (line 10), add:

```js
const rateLimit = require('express-rate-limit');
const { sendTestEmailWith } = require('../lib/sendTestEmail');
```

- [ ] **Step 2: Add the admin test-send rate limiter**

After the `const router = express.Router();` line (line 12), add:

```js

const adminTestEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many test emails. Wait a while and try again.' }
});
```

- [ ] **Step 3: Add the collection route — MUST be registered before `GET /:id`**

Immediately after the existing `GET /` block's closing `);` (currently line 49) and before the `// GET SINGLE USER` comment / `router.get('/:id', ...)` block (currently starting line 55), insert:

```js

// ============================================================================
// GET ALL USERS' EMAIL-SENDING STATUS (Admin only)
// Registered before GET /:id — a literal path segment here would
// otherwise be captured by the :id param route below.
//
// smtpConfigured is derived from smtpUsername alone, never from
// smtpAppPassword — every write path in this file and in
// routes/email.js sets or clears both fields together, so this is a
// safe proxy that keeps the password out of every list response.
// ============================================================================

router.get('/email-settings',
  authenticateToken,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          smtpUsername: true,
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          smtpUsername: u.smtpUsername,
          smtpConfigured: !!u.smtpUsername,
        })),
      });
    } catch (error) {
      console.error('[USERS] Failed to fetch email settings:', error);
      res.status(500).json({ error: 'Failed to fetch email settings' });
    }
  }
);
```

- [ ] **Step 4: Add the three `:id`-scoped routes**

Immediately after the existing `DELETE /:id` block's closing `);` and before `module.exports = router;`, insert:

```js

// ============================================================================
// SET / CLEAR / TEST A TEAMMATE'S EMAIL SETTINGS (Admin only)
// Mirrors routes/email.js's self-service /settings and /test routes, but
// scoped to any :id rather than req.user.id. Never returns
// smtpAppPassword in any response, matching the self-service routes —
// this is a write/clear/test surface, not a read surface.
// ============================================================================

router.put('/:id/email-settings',
  authenticateToken,
  requireRole('ADMIN'),
  [
    body('smtpUsername').isEmail().normalizeEmail().withMessage('A valid email address is required'),
    body('smtpAppPassword').isLength({ min: 1 }).withMessage('App password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const { smtpUsername, smtpAppPassword } = req.body;
      await prisma.user.update({
        where: { id: req.params.id },
        data: { smtpUsername, smtpAppPassword },
      });
      res.json({ smtpConfigured: true, smtpUsername });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('[USERS] Failed to save email settings:', error);
      res.status(500).json({ error: 'Failed to save email settings' });
    }
  }
);

router.delete('/:id/email-settings',
  authenticateToken,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      await prisma.user.update({
        where: { id: req.params.id },
        data: { smtpUsername: null, smtpAppPassword: null },
      });
      res.json({ smtpConfigured: false });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('[USERS] Failed to clear email settings:', error);
      res.status(500).json({ error: 'Failed to clear email settings' });
    }
  }
);

router.post('/:id/email-settings/test',
  authenticateToken,
  requireRole('ADMIN'),
  adminTestEmailLimiter,
  [
    body('to').optional().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { email: true, smtpUsername: true, smtpAppPassword: true },
      });
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (!target.smtpUsername || !target.smtpAppPassword) {
        return res.status(400).json({ error: 'This teammate has not set up their email yet' });
      }
      const recipient = req.body.to || target.email;
      try {
        await sendTestEmailWith({ smtpUsername: target.smtpUsername, smtpAppPassword: target.smtpAppPassword, to: recipient });
        res.json({ success: true });
      } catch (err) {
        res.status(200).json({ success: false, error: String(err.message || err) });
      }
    } catch (error) {
      console.error('[USERS] Test send failed unexpectedly:', error);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  }
);
```

- [ ] **Step 5: Syntax-check the file**

Run: `node -c functions/src/routes/users.js`

Expected: no output, exit code 0.

- [ ] **Step 6: Verify route registration order by reading the file back**

Run: `grep -n "router\.\(get\|put\|delete\|post\)" functions/src/routes/users.js`

Expected output order (top to bottom): `router.get('/'`, `router.get('/email-settings'`, `router.get('/:id'`, `router.put('/:id'`, `router.delete('/:id'`, `router.put('/:id/email-settings'`, `router.delete('/:id/email-settings'`, `router.post('/:id/email-settings/test'`. If `/email-settings` appears after `/:id` in this list, move it — that ordering bug means the route is unreachable (see Global Constraints).

- [ ] **Step 7: Manual smoke test against a running local server (optional but recommended)**

If you have a local server running with `GMAIL_USER`/`GMAIL_APP_PASSWORD` set and a valid admin JWT, confirm the new routes are wired:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/users/email-settings | head -c 500
```

Expected: a JSON object with a `users` array, each entry having `smtpConfigured` (boolean) and `smtpUsername` (string or null), and no `smtpAppPassword` key anywhere in the output. If no local server is available, skip this step — Task 2's reviewer should still verify by reading the code that `smtpAppPassword` is never selected or returned in any of the four new routes.

- [ ] **Step 8: Commit**

```bash
git add functions/src/routes/users.js
git commit -m "feat: add admin-only routes for viewing and managing teammates' SMTP settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — API client functions for admin-managed email settings

**Files:**
- Modify: `src/lib/api.ts` (add new type + 4 new functions, placed near the existing `EmailSettings`/`getMyEmailSettings`/`setMyEmailSettings`/`clearMyEmailSettings`/`sendTestEmail` block)

**Interfaces:**
- Consumes: `GET/PUT/DELETE /api/users/email-settings` and `/api/users/:id/email-settings[/test]` from Task 2.
- Produces (for Task 4 and Task 5 to import from `@/lib/api`):
  - `interface TeamEmailStatus { id: string; username: string; email: string; role: 'ADMIN' | 'OPERATOR' | 'VIEWER'; smtpUsername: string | null; smtpConfigured: boolean; }`
  - `getTeamEmailSettings(): Promise<{ users: TeamEmailStatus[] }>`
  - `setUserEmailSettings(id: string, smtpUsername: string, smtpAppPassword: string): Promise<{ smtpConfigured: true; smtpUsername: string }>`
  - `clearUserEmailSettings(id: string): Promise<{ smtpConfigured: false }>`
  - `sendTestEmailForUser(id: string, to?: string): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Find the existing self-service email settings block**

Run: `grep -n "export async function sendTestEmail" src/lib/api.ts`

This is the anchor — add the new code immediately after this function's closing `}`.

- [ ] **Step 2: Add the new type and functions**

Insert immediately after `sendTestEmail`'s closing brace in `src/lib/api.ts`:

```ts

export interface TeamEmailStatus {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  smtpUsername: string | null;
  smtpConfigured: boolean;
}

export async function getTeamEmailSettings(): Promise<{ users: TeamEmailStatus[] }> {
  const response = await fetch(`${API_BASE_URL}/api/users/email-settings`, { headers: getAuthHeaders() });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to load email settings');
  }
  return response.json();
}

export async function setUserEmailSettings(id: string, smtpUsername: string, smtpAppPassword: string): Promise<{ smtpConfigured: true; smtpUsername: string }> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}/email-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ smtpUsername, smtpAppPassword }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save email settings');
  }
  return response.json();
}

export async function clearUserEmailSettings(id: string): Promise<{ smtpConfigured: false }> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}/email-settings`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to clear email settings');
  return response.json();
}

export async function sendTestEmailForUser(id: string, to?: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}/email-settings/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(to ? { to } : {}),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send test email');
  }
  return response.json();
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no new errors (the baseline should be 0, matching the current state of `main`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add API client functions for admin-managed teammate email settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — admin mode for `EmailSettingsDialog`

**Files:**
- Modify: `src/components/layout/EmailSettingsDialog.tsx` (full file — add `targetUser`/`onChanged` props and branch the load/save/test/deactivate handlers on their presence)
- Modify: `src/components/layout/EmailSettingsDialog.test.tsx` (extend with admin-mode test cases)

**Interfaces:**
- Consumes: `setUserEmailSettings`, `clearUserEmailSettings`, `sendTestEmailForUser`, `TeamEmailStatus` from Task 3 (`@/lib/api`).
- Produces (for Task 5's `ManagementView.tsx`): `EmailSettingsDialog` now accepts two new optional props:
  - `targetUser?: Pick<TeamEmailStatus, 'id' | 'username' | 'email' | 'smtpUsername' | 'smtpConfigured'>` — when set, the dialog edits this teammate instead of the signed-in user.
  - `onChanged?: () => void` — called after a successful save or deactivate, so the caller can refresh its own list.

  The existing self-service call sites (`AppShell.tsx`, wherever `<EmailSettingsDialog isOpen onClose={...} />` is currently rendered with no other props) are unaffected — both new props are optional and default to self-service behavior when omitted.

- [ ] **Step 1: Read the current file to confirm no drift**

Run: `cat src/components/layout/EmailSettingsDialog.tsx`

It should match the "Current State" listing in the spec (`docs/superpowers/specs/2026-09-14-management-tab-admin-email-settings-design.md`) — the version with the "Send test to" field already added. If it differs, stop and report — do not guess at a merge.

- [ ] **Step 2: Replace the whole file**

Replace the entire contents of `src/components/layout/EmailSettingsDialog.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import {
  getMyEmailSettings, setMyEmailSettings, clearMyEmailSettings, sendTestEmail,
  setUserEmailSettings, clearUserEmailSettings, sendTestEmailForUser,
  type TeamEmailStatus,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface EmailSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Admin-only: edit this teammate's credentials instead of the caller's own. */
  targetUser?: Pick<TeamEmailStatus, 'id' | 'username' | 'email' | 'smtpUsername' | 'smtpConfigured'>;
  /** Admin-only: called after a successful save or deactivate, so the roster badge can refresh. */
  onChanged?: () => void;
}

export default function EmailSettingsDialog({ isOpen, onClose, targetUser, onChanged }: EmailSettingsDialogProps) {
  const [configured, setConfigured] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [loading, setLoading] = useState(!targetUser);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTestResult(null);

    if (targetUser) {
      setConfigured(targetUser.smtpConfigured);
      setSmtpUsername(targetUser.smtpUsername ?? '');
      setSmtpAppPassword('');
      setTestTo(targetUser.smtpUsername ?? targetUser.email);
      setLoading(false);
      return;
    }

    setLoading(true);
    getMyEmailSettings()
      .then((settings) => {
        setConfigured(settings.configured);
        setSmtpUsername(settings.smtpUsername ?? '');
        setTestTo(settings.smtpUsername ?? '');
      })
      .catch((err) => {
        toast({
          title: 'Failed to load email settings',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [isOpen, targetUser]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (targetUser) {
        await setUserEmailSettings(targetUser.id, smtpUsername, smtpAppPassword);
      } else {
        await setMyEmailSettings(smtpUsername, smtpAppPassword);
      }
      setConfigured(true);
      setSmtpAppPassword('');
      toast({ title: 'Email settings saved' });
      onChanged?.();
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = targetUser
        ? await sendTestEmailForUser(targetUser.id, testTo)
        : await sendTestEmail(testTo);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Failed to send test email' });
    } finally {
      setTesting(false);
    }
  };

  const handleDeactivate = async () => {
    setSaving(true);
    try {
      if (targetUser) {
        await clearUserEmailSettings(targetUser.id);
      } else {
        await clearMyEmailSettings();
      }
      setConfigured(false);
      setSmtpUsername('');
      setSmtpAppPassword('');
      setTestTo('');
      setTestResult(null);
      toast({ title: 'Email deactivated' });
      onChanged?.();
    } catch (err) {
      toast({
        title: 'Failed to deactivate',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {targetUser ? `Email Settings — ${targetUser.username}` : 'Email Settings'}
          </DialogTitle>
          <DialogDescription>
            {targetUser
              ? `Set or clear ${targetUser.username}'s Gmail address and App Password for sending email.`
              : 'Send emails from your own Gmail address instead of the shared account.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-username">Gmail address</Label>
              <Input
                id="smtp-username"
                type="email"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                placeholder="you@gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-app-password">App password</Label>
              <Input
                id="smtp-app-password"
                type="password"
                value={smtpAppPassword}
                onChange={(e) => setSmtpAppPassword(e.target.value)}
                placeholder={configured ? 'Enter a new app password to change it' : '16-character app password'}
              />
            </div>

            {configured && (
              <div className="space-y-1.5">
                <Label htmlFor="test-email-to">Send test to</Label>
                <Input
                  id="test-email-to"
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            )}

            {testResult && (
              <p className={testResult.success ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
                {testResult.success ? 'Test email sent successfully.' : testResult.error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !smtpUsername || !smtpAppPassword}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !configured || !testTo}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send test email
              </Button>
            </div>

            {configured && (
              <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={handleDeactivate} disabled={saving}>
                Deactivate
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Extend the test file's mock to cover the new admin functions**

In `src/components/layout/EmailSettingsDialog.test.tsx`, replace the existing mock block:

```tsx
const mockGetSettings = vi.fn();
const mockSetSettings = vi.fn();
const mockClearSettings = vi.fn();
const mockSendTest = vi.fn();

vi.mock('@/lib/api', () => ({
  getMyEmailSettings: () => mockGetSettings(),
  setMyEmailSettings: (u: string, p: string) => mockSetSettings(u, p),
  clearMyEmailSettings: () => mockClearSettings(),
  sendTestEmail: (to?: string) => mockSendTest(to),
}));
```

with:

```tsx
const mockGetSettings = vi.fn();
const mockSetSettings = vi.fn();
const mockClearSettings = vi.fn();
const mockSendTest = vi.fn();
const mockSetUserSettings = vi.fn();
const mockClearUserSettings = vi.fn();
const mockSendTestForUser = vi.fn();

vi.mock('@/lib/api', () => ({
  getMyEmailSettings: () => mockGetSettings(),
  setMyEmailSettings: (u: string, p: string) => mockSetSettings(u, p),
  clearMyEmailSettings: () => mockClearSettings(),
  sendTestEmail: (to?: string) => mockSendTest(to),
  setUserEmailSettings: (id: string, u: string, p: string) => mockSetUserSettings(id, u, p),
  clearUserEmailSettings: (id: string) => mockClearUserSettings(id),
  sendTestEmailForUser: (id: string, to?: string) => mockSendTestForUser(id, to),
}));
```

- [ ] **Step 4: Add admin-mode test cases**

Add these tests inside the existing `describe('EmailSettingsDialog', ...)` block, after the last existing test (`'shows a Deactivate button once configured...'`):

```tsx
  it('admin mode: shows the teammate\'s name in the title and seeds fields without an extra load call', async () => {
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: 'jane@gmail.com', smtpConfigured: true }}
      />
    );

    expect(await screen.findByText('Email Settings — jane')).toBeTruthy();
    expect(mockGetSettings).not.toHaveBeenCalled();
    const usernameField = screen.getByLabelText(/gmail address/i) as HTMLInputElement;
    expect(usernameField.value).toBe('jane@gmail.com');
  });

  it('admin mode: Save calls setUserEmailSettings with the target id, not the self-service function', async () => {
    const user = userEvent.setup();
    mockSetUserSettings.mockResolvedValue({ smtpConfigured: true, smtpUsername: 'jane@gmail.com' });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: null, smtpConfigured: false }}
      />
    );

    await user.type(screen.getByLabelText(/gmail address/i), 'jane@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockSetUserSettings).toHaveBeenCalledWith('u9', 'jane@gmail.com', 'abcd efgh ijkl mnop'));
    expect(mockSetSettings).not.toHaveBeenCalled();
  });

  it('admin mode: Deactivate calls clearUserEmailSettings with the target id', async () => {
    const user = userEvent.setup();
    mockClearUserSettings.mockResolvedValue({ smtpConfigured: false });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: 'jane@gmail.com', smtpConfigured: true }}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => expect(mockClearUserSettings).toHaveBeenCalledWith('u9'));
    expect(mockClearSettings).not.toHaveBeenCalled();
  });

  it('admin mode: Send test email calls sendTestEmailForUser with the target id and the typed address', async () => {
    const user = userEvent.setup();
    mockSendTestForUser.mockResolvedValue({ success: true });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: 'jane@gmail.com', smtpConfigured: true }}
      />
    );

    const testToField = screen.getByLabelText(/send test to/i) as HTMLInputElement;
    expect(testToField.value).toBe('jane@gmail.com');
    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(mockSendTestForUser).toHaveBeenCalledWith('u9', 'jane@gmail.com'));
    expect(mockSendTest).not.toHaveBeenCalled();
  });

  it('admin mode: calls onChanged after a successful save', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    mockSetUserSettings.mockResolvedValue({ smtpConfigured: true, smtpUsername: 'jane@gmail.com' });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: null, smtpConfigured: false }}
        onChanged={onChanged}
      />
    );

    await user.type(screen.getByLabelText(/gmail address/i), 'jane@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
```

- [ ] **Step 5: Run the test file**

Run: `npx vitest run src/components/layout/EmailSettingsDialog.test.tsx`

Expected: all 10 tests pass (5 existing + 5 new).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/EmailSettingsDialog.tsx src/components/layout/EmailSettingsDialog.test.tsx
git commit -m "feat: add admin mode to EmailSettingsDialog for editing a teammate's credentials

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — new `ManagementView.tsx` roster

**Files:**
- Create: `src/components/team/ManagementView.tsx`
- Create: `src/components/team/ManagementView.test.tsx`

**Interfaces:**
- Consumes: `getTeamEmailSettings`, `TeamEmailStatus` from Task 3 (`@/lib/api`); `EmailSettingsDialog` with `targetUser`/`onChanged` from Task 4 (`@/components/layout/EmailSettingsDialog`); `pillClass` from `@/lib/pillBadge` (existing, used identically by `TeamView.tsx`).
- Produces (for Task 6's nav wiring): default export `ManagementView` — a zero-prop component, rendered exactly like `TeamView` is today (`<ManagementView />`, no props).

- [ ] **Step 1: Confirm `pillClass`'s signature before use**

Run: `grep -n "export function pillClass" src/lib/pillBadge.ts`

Confirm it accepts a tone string (e.g. `'success' | 'grey' | ...`) — `TeamView.tsx` already calls it as `pillClass(member.isActive ? 'success' : 'grey')`, so the same two tone values are safe to reuse here.

- [ ] **Step 2: Create `ManagementView.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pillClass } from '@/lib/pillBadge';
import EmailSettingsDialog from '@/components/layout/EmailSettingsDialog';
import { getTeamEmailSettings, type TeamEmailStatus } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const ROLE_LABELS: Record<'ADMIN' | 'OPERATOR' | 'VIEWER', string> = {
  ADMIN: 'Manager',
  OPERATOR: 'Team Member',
  VIEWER: 'Viewer',
};

export default function ManagementView() {
  const [members, setMembers] = useState<TeamEmailStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamEmailStatus | null>(null);

  const load = async () => {
    const { users } = await getTeamEmailSettings();
    setMembers(users);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => {
        toast({ title: 'Failed to load team email settings', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, []);

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
        <h1 className="text-2xl font-semibold">Management</h1>
        <p className="text-sm text-muted-foreground">Set up or clear a teammate's email-sending credentials.</p>
      </div>

      <section className="space-y-3 rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Email sending</th>
                <th className="px-4 py-2 text-left font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{member.username}</td>
                  <td className="px-4 py-2 text-muted-foreground">{ROLE_LABELS[member.role]}</td>
                  <td className="px-4 py-2">
                    <span className={pillClass(member.smtpConfigured ? 'success' : 'grey')}>
                      {member.smtpConfigured ? 'Configured' : 'Not configured'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(member)}>
                      Manage email
                    </Button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No teammates yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EmailSettingsDialog
          isOpen
          onClose={() => setEditing(null)}
          targetUser={editing}
          onChanged={load}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `ManagementView.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ManagementView from './ManagementView';

const mockGetTeamEmailSettings = vi.fn();
const mockSendTest = vi.fn();

vi.mock('@/lib/api', () => ({
  getTeamEmailSettings: () => mockGetTeamEmailSettings(),
  getMyEmailSettings: vi.fn(),
  setMyEmailSettings: vi.fn(),
  clearMyEmailSettings: vi.fn(),
  sendTestEmail: vi.fn(),
  setUserEmailSettings: vi.fn().mockResolvedValue({ smtpConfigured: true, smtpUsername: 'jane@gmail.com' }),
  clearUserEmailSettings: vi.fn().mockResolvedValue({ smtpConfigured: false }),
  sendTestEmailForUser: (id: string, to?: string) => mockSendTest(id, to),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTeamEmailSettings.mockResolvedValue({
    users: [
      { id: 'u1', username: 'admin', email: 'admin@example.com', role: 'ADMIN', smtpUsername: null, smtpConfigured: false },
      { id: 'u9', username: 'jane', email: 'jane@example.com', role: 'OPERATOR', smtpUsername: 'jane@gmail.com', smtpConfigured: true },
    ],
  });
});

describe('ManagementView', () => {
  it('renders each teammate with their configured/not-configured status', async () => {
    render(<ManagementView />);
    await waitFor(() => expect(mockGetTeamEmailSettings).toHaveBeenCalled());

    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText('jane')).toBeTruthy();
    expect(screen.getByText('Not configured')).toBeTruthy();
    expect(screen.getByText('Configured')).toBeTruthy();
  });

  it('opens the EmailSettingsDialog in admin mode for the clicked row', async () => {
    const user = userEvent.setup();
    render(<ManagementView />);
    await waitFor(() => expect(screen.getByText('jane')).toBeTruthy());

    const rows = screen.getAllByRole('row');
    const janeRow = rows.find((r) => r.textContent?.includes('jane'));
    await user.click(janeRow!.querySelector('button')!);

    expect(await screen.findByText('Email Settings — jane')).toBeTruthy();
  });

  it('reloads the roster after a change in the dialog', async () => {
    const user = userEvent.setup();
    render(<ManagementView />);
    await waitFor(() => expect(screen.getByText('admin')).toBeTruthy());

    const rows = screen.getAllByRole('row');
    const adminRow = rows.find((r) => r.textContent?.includes('admin'));
    await user.click(adminRow!.querySelector('button')!);

    await screen.findByText('Email Settings — admin');
    await user.type(screen.getByLabelText(/gmail address/i), 'admin@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockGetTeamEmailSettings).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 4: Run the new test file**

Run: `npx vitest run src/components/team/ManagementView.test.tsx`

Expected: all 3 tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/team/ManagementView.tsx src/components/team/ManagementView.test.tsx
git commit -m "feat: add ManagementView listing teammates' email-sending status

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — nav wiring (tab type, routing, Sidebar, TopBar)

**Files:**
- Modify: `src/components/layout/navItems.ts` (add `'management'` to `TabType`)
- Modify: `src/pages/Index.tsx` (import `ManagementView`; add `'management'` to `validTabs`; add a `case 'management'` to the `renderContent()` switch)
- Modify: `src/components/layout/Sidebar.tsx` (add `UserCog` to the lucide-react import; add a new `isAdmin`-gated nav button)
- Modify: `src/components/layout/TopBar.tsx` (add `UserCog` to the lucide-react import; add a new `isAdmin`-gated mobile-menu button)
- Modify: `src/components/layout/Sidebar.test.tsx` (add a case confirming the Management button shows for ADMIN)
- Modify: `src/components/layout/TopBar.test.tsx` (add a case confirming the Management button shows for ADMIN)

**Interfaces:**
- Consumes: `ManagementView` default export from Task 5 (`@/components/team/ManagementView`).

- [ ] **Step 1: Add `'management'` to `TabType`**

In `src/components/layout/navItems.ts`, replace:

```ts
export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'crm' | 'evictions' | 'mls' | 'inbox' | 'team';
```

with:

```ts
export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'crm' | 'evictions' | 'mls' | 'inbox' | 'team' | 'management';
```

Do NOT add `'management'` to the `tabs` array further down in the same file — like `'team'`, it is a special-cased admin-only tab, not part of the hideable/orderable tab list.

- [ ] **Step 2: Wire `Index.tsx`**

In `src/pages/Index.tsx`, add the import near the existing `import TeamView from '@/components/team/TeamView';` line:

```tsx
import ManagementView from '@/components/team/ManagementView';
```

Replace the `validTabs` array (line 32):

```tsx
  const validTabs: TabType[] = ['dashboard', 'calendar', 'properties', 'tasks', 'upload', 'files', 'preforeclosure', 'crm', 'driving', 'evictions', 'mls', 'inbox', 'team'];
```

with:

```tsx
  const validTabs: TabType[] = ['dashboard', 'calendar', 'properties', 'tasks', 'upload', 'files', 'preforeclosure', 'crm', 'driving', 'evictions', 'mls', 'inbox', 'team', 'management'];
```

In the `renderContent()` switch, immediately after the existing:

```tsx
      case 'team':
        return user?.role === 'ADMIN' ? <TeamView /> : <Dashboard onNavigateToTab={setActiveTab} />;
```

add:

```tsx
      case 'management':
        return user?.role === 'ADMIN' ? <ManagementView /> : <Dashboard onNavigateToTab={setActiveTab} />;
```

- [ ] **Step 3: Wire `Sidebar.tsx`**

Replace the lucide-react import line (line 1):

```tsx
import { Building2, ChevronDown, FileText, LogOut, Mail, Settings, Upload, Users } from 'lucide-react'
```

with:

```tsx
import { Building2, ChevronDown, FileText, LogOut, Mail, Settings, Upload, UserCog, Users } from 'lucide-react'
```

Immediately after the existing Team `<li>` block (currently lines 96-102) and before the Settings `<li>` block (currently lines 104-110), insert:

```tsx
        {isAdmin && (
          <li>
            <button type="button" onClick={() => onTabChange('management')} className={itemClasses(activeTab === 'management')}>
              <UserCog className="h-[18px] w-[18px] shrink-0" />
              Management
            </button>
          </li>
        )}
```

- [ ] **Step 4: Wire `TopBar.tsx`**

Replace the lucide-react import line (line 2):

```tsx
import { Bell, FileText, LogOut, Mail, Menu, RefreshCw, Search, Settings, Upload, Users, X } from 'lucide-react'
```

with:

```tsx
import { Bell, FileText, LogOut, Mail, Menu, RefreshCw, Search, Settings, Upload, UserCog, Users, X } from 'lucide-react'
```

Immediately after the existing Team button block (currently lines 184-189) and before the Manager Settings button block (currently lines 190-195), insert:

```tsx
                {isAdmin && (
                  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('management') }}>
                    <UserCog className="h-5 w-5 mr-3" />
                    Management
                  </Button>
                )}
```

- [ ] **Step 5: Add a Sidebar test case**

In `src/components/layout/Sidebar.test.tsx`, add this test at the end of the `describe('Sidebar', ...)` block, after the existing `'renders a Settings item for an ADMIN user'` test:

```tsx
  it('does not render a Management item for a non-ADMIN user', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /Management/ })).toBeNull()
  })

  it('renders a Management item for an ADMIN user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' } } as any)
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Management/ })).toBeTruthy()
  })
```

- [ ] **Step 6: Add a TopBar test case**

In `src/components/layout/TopBar.test.tsx`, add this test at the end of the `describe('TopBar', ...)` block, after the existing `'mobile sheet lists Manager Settings for an ADMIN user'` test:

```tsx
  it('mobile sheet does not list Management for a non-admin', async () => {
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Management/ })).toBeNull()
  })

  it('mobile sheet lists Management for an ADMIN user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' }, logout: vi.fn() } as any)
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Management/ })).toBeTruthy())
  })
```

- [ ] **Step 7: Run the full frontend test suite**

Run: `npx vitest run`

Expected: every test file passes, total test count increased by 3 (Task 5's `ManagementView.test.tsx`) + 5 (Task 4's new `EmailSettingsDialog` cases) + 2 (Sidebar) + 2 (TopBar) = 12 new tests over the pre-Task-1 baseline.

- [ ] **Step 8: Type-check and build**

Run: `npx tsc --noEmit && npm run build`

Expected: both succeed with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/navItems.ts src/pages/Index.tsx src/components/layout/Sidebar.tsx src/components/layout/TopBar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/TopBar.test.tsx
git commit -m "feat: wire the Management tab into navigation for ADMIN users

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Manual Verification (after all tasks complete)

Since there are no backend route tests, do a manual pass after Task 6 lands (locally or after a deploy):

1. Sign in as a non-ADMIN user — confirm no "Management" button appears in the Sidebar or the TopBar mobile menu, and that navigating to `#management` directly falls back to the Dashboard (mirrors the existing `#team` behavior for non-admins).
2. Sign in as an ADMIN — click "Management", confirm the roster loads with correct "Configured"/"Not configured" badges matching each teammate's actual `smtpUsername` state.
3. Click "Manage email" on a teammate with no credentials set — confirm the dialog title reads "Email Settings — {username}", save a test Gmail address + App Password, confirm the badge flips to "Configured" after the dialog closes (or immediately, via `onChanged`).
4. Click "Send test email" for that teammate with a custom address typed into "Send test to" — confirm the email arrives at that address, not the teammate's own account email.
5. Click "Deactivate" — confirm the badge flips back to "Not configured" and the teammate's self-service `EmailSettingsDialog` (from their own account dropdown) now also shows not-configured.
6. Confirm `smtpAppPassword` never appears in any Network tab response while performing steps 2-5 (check `GET /api/users/email-settings`, `PUT .../email-settings`, and `POST .../email-settings/test` responses specifically).
