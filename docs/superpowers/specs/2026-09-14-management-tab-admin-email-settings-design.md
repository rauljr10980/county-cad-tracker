# Management Tab — Admin-Editable Per-Teammate SMTP Credentials — Design Spec

## Goal

Add a new, admin-only "Management" tab, separate from the existing "Team" tab (which stays exactly as-is — invites, activate/deactivate, and role changes all remain there). The Management tab lets an admin (`ADMIN` role, labeled "Manager" in the UI) view which teammates have configured their own SMTP credentials for the ad-hoc "compose and send" email feature, and set, clear, or test-send those credentials on a teammate's behalf — without ever being able to read back a stored password.

This closes the one gap in the per-user SMTP feature shipped immediately before this spec (`feat/smtp-email-per-user-sending`): that feature is strictly self-service (`req.user.id`-scoped `/api/email/settings` routes). An admin currently has no way to help a teammate who can't get their own App Password working, or to set it up on their behalf.

## Current State (confirmed by reading the code)

- **`User` model** (`functions/prisma/schema.prisma`) already has `smtpUsername String?` and `smtpAppPassword String?`, both nullable. **Invariant relied on below:** every write path (`PUT`/`DELETE /api/email/settings`) always sets or clears both fields together — there is no route that sets one without the other — so `!!smtpUsername` is a safe proxy for "configured" without ever selecting `smtpAppPassword` in a list query.
- **`functions/src/routes/email.js`** (self-service, `req.user.id`-scoped) has `GET/PUT/DELETE /settings` and `POST /test` (rate-limited via `testEmailLimiter`, keyed on `req.user.id`, `windowMs: 15*60*1000, max: 5`). `POST /test` just gained (in the immediately-preceding bounded change) an optional `to` body field — it now sends to `req.body.to || user.email` instead of always `user.email`. Current full file:

```js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { sendEmail, sendEmailSmtp } = require('../lib/emailService');
const { authenticateToken } = require('../middleware/auth');

const testEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many test emails. Wait a while and try again.' }
});

// POST /api/email/send — unchanged by this spec, omitted here for length.
// ...

// GET /api/email/settings — unchanged by this spec.
// PUT /api/email/settings — unchanged by this spec.
// DELETE /api/email/settings — unchanged by this spec.

// POST /api/email/test — sends one email using the caller's saved SMTP
// credentials, to their own account email by default or to `to` in the
// body when provided.
router.post('/test',
  authenticateToken,
  testEmailLimiter,
  [
    body('to').optional().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { email: true, smtpUsername: true, smtpAppPassword: true },
      });
      if (!user.smtpUsername || !user.smtpAppPassword) {
        return res.status(400).json({ error: 'Set up your email first' });
      }
      const recipient = req.body.to || user.email;
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
    } catch (error) {
      console.error('[EMAIL] Test send failed unexpectedly:', error.message);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  }
);

module.exports = router;
```

- **`functions/src/routes/users.js`** (admin CRUD on other users) currently has, in order: `GET /` (list, `requireRole('ADMIN', 'OPERATOR')`, selects `id, username, email, role, isActive, createdAt, updatedAt, _count`), `GET /:id`, `PUT /:id` (explicit allowlist of `email`/`password`/`role`/`isActive` — deliberately excludes `smtpUsername`/`smtpAppPassword`, with a self-demotion guard), `DELETE /:id`. No route currently touches SMTP fields at all.
- **`src/components/layout/EmailSettingsDialog.tsx`** (self-service UI) shows Gmail address + App Password fields, a "Send test to" field (just added, prefilled from the configured address), Save / Send test email / Deactivate buttons. Password is never pre-filled from the server. Full current file:

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import { getMyEmailSettings, setMyEmailSettings, clearMyEmailSettings, sendTestEmail } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface EmailSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EmailSettingsDialog({ isOpen, onClose }: EmailSettingsDialogProps) {
  const [configured, setConfigured] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setTestResult(null);
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
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setMyEmailSettings(smtpUsername, smtpAppPassword);
      setConfigured(true);
      setSmtpAppPassword('');
      toast({ title: 'Email settings saved' });
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
      const result = await sendTestEmail(testTo);
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
      await clearMyEmailSettings();
      setConfigured(false);
      setSmtpUsername('');
      setSmtpAppPassword('');
      setTestTo('');
      setTestResult(null);
      toast({ title: 'Email deactivated' });
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
            Email Settings
          </DialogTitle>
          <DialogDescription>
            Send emails from your own Gmail address instead of the shared account.
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

- **`src/lib/api.ts`** has `EmailSettings`, `getMyEmailSettings()`, `setMyEmailSettings()`, `clearMyEmailSettings()`, `sendTestEmail(to?: string)` (self-service), and separately `TeamMember`/`TeamInvite` types plus `getUsers()`, `setUserActive()`, `setUserRole()` (admin, used by `TeamView.tsx`).
- **Nav-tab pattern for an admin-only full tab** (as opposed to a dialog): `navItems.ts`'s `TabType` union includes `'team'`, but `'team'` is **not** in the `tabs` array (the hideable/orderable tab list) — it's a special-cased tab, hardcoded directly in `Sidebar.tsx` and `TopBar.tsx`, gated by `isAdmin`. `src/pages/Index.tsx`'s `getInitialTab()` has a `validTabs` array (must list every valid hash) and a `renderContent()` switch with `case 'team': return user?.role === 'ADMIN' ? <TeamView /> : <Dashboard onNavigateToTab={setActiveTab} />;`.
- **`Sidebar.tsx`** (`src/components/layout/Sidebar.tsx`): `isAdmin = user?.role === 'ADMIN'`. Lines 96-111:

```tsx
{isAdmin && (
  <li>
    <button type="button" onClick={() => onTabChange('team')} className={itemClasses(activeTab === 'team')}>
      <Users className="h-[18px] w-[18px] shrink-0" />
      Team
    </button>
  </li>
)}
{isAdmin && (
  <li>
    <button type="button" onClick={onOpenManagerView} className={itemClasses(false)}>
      <Settings className="h-[18px] w-[18px] shrink-0" />
      Settings
    </button>
  </li>
)}
```

  Its lucide-react import line (line 1): `import { Building2, ChevronDown, FileText, LogOut, Mail, Settings, Upload, Users } from 'lucide-react'`.

- **`TopBar.tsx`** (`src/components/layout/TopBar.tsx`) has the equivalent mobile-menu buttons, lines 183-192:

```tsx
{isAdmin && (
  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('team') }}>
    <Users className="h-5 w-5 mr-3" />
    Team
  </Button>
)}
{isAdmin && (
  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onOpenManagerView() }}>
    <Settings className="h-5 w-5 mr-3" />
    Manager Settings
  </Button>
)}
```

  Its lucide-react import line (line 2): `import { Bell, FileText, LogOut, Mail, Menu, RefreshCw, Search, Settings, Upload, Users, X } from 'lucide-react'`.

- **`TeamView.tsx`** (`src/components/team/TeamView.tsx`) is the model for a new admin-only list view: loads via `Promise.all([getInvites(), getUsers()])`, renders an HTML `<table>` per section with `pillClass()` badges, a per-row `Select` for role, per-row `Button` for activate/deactivate. `ROLE_LABELS` there is `{ ADMIN: 'Manager', OPERATOR: 'Normal User' }` (no `VIEWER` entry — never hit in practice, but this repo's convention elsewhere, e.g. `Sidebar.tsx`, does include a `VIEWER: 'Viewer'` entry).

## Part 1: Backend — shared test-send helper + admin routes

### New file: `functions/src/lib/sendTestEmail.js`

Extracts the "send one canned test message with a given credential pair" logic so both the self-service and admin-scoped test routes call the same code instead of duplicating it.

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

### Modify `functions/src/routes/email.js`

Replace the import line:

```js
const { sendEmail, sendEmailSmtp } = require('../lib/emailService');
```

with:

```js
const { sendEmail } = require('../lib/emailService');
const { sendTestEmailWith } = require('../lib/sendTestEmail');
```

In `POST /test`, replace the inner `sendEmailSmtp({...})` call:

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

Everything else in `email.js` (the rate limiter, `/send`, `/settings` GET/PUT/DELETE) is unchanged.

### Modify `functions/src/routes/users.js`

Add two new `require`s near the top, alongside the existing ones:

```js
const rateLimit = require('express-rate-limit');
const { sendTestEmailWith } = require('../lib/sendTestEmail');
```

Add a rate limiter (same shape as `email.js`'s `testEmailLimiter`, but keyed on the **admin's** id since the admin, not the target teammate, is the one making the calls — this bounds how many concurrent SMTP connections one admin can open regardless of how many different teammates they test):

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

Insert a new collection route **immediately after the existing `GET /` block (after its closing `);` on line 49) and before `GET /:id` (line 55)**. Registration order matters here: Express matches `/:id` against any single path segment, so a literal route at `/email-settings` must be registered first or `GET /:id` will swallow it as `id: "email-settings"`.

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

Add three new `:id`-scoped routes **after the existing `DELETE /:id` block, before `module.exports = router;`**. These have an extra path segment (`/email-settings`, `/email-settings/test`) so they don't collide with the plain `/:id` routes regardless of order:

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

All three new `:id`-scoped routes, and the new collection route, are wrapped in try/catch end-to-end — this codebase's Express 4 setup does not auto-forward a rejected async-handler promise to the global error middleware, so an uncaught rejection here would crash the whole API process for every user, not just the caller (this was the Critical finding from the SMTP branch's final review; the same risk applies to any new async route in this file).

No schema change is needed — `smtpUsername`/`smtpAppPassword` already exist on `User`.

## Part 2: Frontend

### Modify `src/lib/api.ts`

Add, near the existing `EmailSettings`/`getMyEmailSettings`/etc. block:

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

### Modify `src/components/layout/EmailSettingsDialog.tsx` — add admin mode

Add an optional `targetUser` prop. When present, the dialog edits that teammate's credentials instead of the caller's own: no `GET` round-trip is needed (the roster row already carries `smtpUsername`/`smtpConfigured`), the title and description change, and Save/Test/Deactivate call the admin-scoped `api.ts` functions. The password field's behavior (never pre-filled, cleared after save) is identical in both modes — no change needed there.

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

### New file: `src/components/team/ManagementView.tsx`

Parallel to `TeamView.tsx`, but scoped to email-sending status only — no invites, no activate/deactivate, no role editing (those all stay in `TeamView.tsx`, unchanged).

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

### Nav wiring

`src/components/layout/navItems.ts` — add `'management'` to the `TabType` union (not to the `tabs` array — like `'team'`, this is a special-cased admin-only tab, not part of the hideable/orderable list):

```ts
export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'crm' | 'evictions' | 'mls' | 'inbox' | 'team' | 'management';
```

`src/pages/Index.tsx` — add `'management'` to the `validTabs` array (line 32), import `ManagementView`, add a case to the `renderContent()` switch right after `case 'team'`:

```tsx
import ManagementView from '@/components/team/ManagementView';
// ...
case 'management':
  return user?.role === 'ADMIN' ? <ManagementView /> : <Dashboard onNavigateToTab={setActiveTab} />;
```

`src/components/layout/Sidebar.tsx` — add `UserCog` to the lucide-react import line, add a new `isAdmin`-gated `<li>` right after the existing Team block (between Team and the Settings/`onOpenManagerView` block):

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

`src/components/layout/TopBar.tsx` — add `UserCog` to the lucide-react import line, add the matching mobile-menu button right after the existing Team button (between Team and the Manager Settings button):

```tsx
{isAdmin && (
  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('management') }}>
    <UserCog className="h-5 w-5 mr-3" />
    Management
  </Button>
)}
```

## Security invariants (carried forward from the self-service feature)

- `smtpAppPassword` is never selected in any query whose result reaches an HTTP response — not in the list route, not in the `PUT`/`DELETE` responses, not in the test route's error messages (the underlying SMTP error string does not echo the password back).
- The password field in the dialog is always write-only: blank on open (both self-service and admin mode), never pre-filled from a stored value.
- All three new `:id`-scoped admin routes, and the new collection route, require `ADMIN` specifically (not `ADMIN`+`OPERATOR` — a stricter gate than the existing `GET /api/users`, matching the Sidebar/TopBar `isAdmin`-only gating already used for the Team tab).
- The admin test-send route is rate-limited exactly like the self-service one, keyed on the calling admin's own id, so one admin cannot open unbounded concurrent SMTP connections regardless of how many teammates they test in a loop.
- **No self-exclusion needed.** Unlike `TeamView.tsx`'s role-change and activate/deactivate controls (which disable the row for `member.id === user.id`, since stripping your own admin role or deactivating your own account is a lockout risk), the Management tab's roster includes the admin's own row with no special-casing. An admin editing their own SMTP credentials through `PUT /api/users/:id/email-settings` has the exact same effect and security posture as using their own self-service `EmailSettingsDialog` from the account dropdown — there is no lockout risk, so `ManagementView.tsx` must not copy `TeamView.tsx`'s `isSelf` disabling pattern here.

## Testing

Component tests only, matching this repo's established convention (confirmed: zero `*.test.js` files exist under `functions/src/routes/` — backend routes are not unit-tested directly in this codebase):

- `src/components/team/ManagementView.test.tsx` (new): renders the roster with configured/not-configured badges from a mocked `getTeamEmailSettings()`; clicking "Manage email" opens `EmailSettingsDialog` with the right `targetUser`; a mocked `onChanged` callback (via the dialog) triggers a reload.
- `src/components/layout/EmailSettingsDialog.test.tsx` (extend the existing file): add cases for `targetUser` mode — title shows the teammate's username, no `getMyEmailSettings` call happens (seeded synchronously from `targetUser`), Save calls `setUserEmailSettings(targetUser.id, ...)` not `setMyEmailSettings`, Deactivate calls `clearUserEmailSettings(targetUser.id)`, Test calls `sendTestEmailForUser(targetUser.id, testTo)`.

## Out of scope

- Inviting teammates, activating/deactivating accounts, and role changes — all stay in the existing Team tab, unchanged, per explicit instruction ("keep Team as-is, add a separate Management tab").
- Any change to Brevo, the outbox (`EmailMessage`), or the password-reset/invite email flows — untouched by this spec.
- A dedicated "single teammate" GET endpoint — not needed, since the roster list already carries everything the dialog needs (`smtpUsername`, `smtpConfigured`, `email`) to seed itself without an extra round trip.
