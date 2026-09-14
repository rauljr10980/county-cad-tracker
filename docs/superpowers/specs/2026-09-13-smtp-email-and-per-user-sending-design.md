# SMTP Email + Per-User Sending — Design Spec

## Goal

Replace Brevo (the currently-active email provider, an HTTP API) with raw SMTP via `nodemailer` and Gmail for the CRM's system emails (password-reset, invites), matching a reference architecture the user provided (plain SMTP, no third-party SDK, a write-first "outbox" table with per-event idempotency). Brevo's code stays in the repo, fully intact, simply uncalled — a deliberate deactivation, not a removal, so it can be turned back on with a small follow-up change whenever asked. Separately, add a self-service per-user SMTP feature so any team member can paste in their own Gmail address + App Password and have the CRM's ad-hoc "compose and send" email feature go out from their own address instead of the shared system account.

## Current State (confirmed by reading the code)

- `functions/src/lib/emailService.js` sends every email through Brevo's HTTP API (`@getbrevo/brevo`), requiring `BREVO_API_KEY` (and optional `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME`).
- Three call sites use it: `functions/src/routes/auth.js`'s `POST /forgot-password` (password-reset email) and `POST /invites` (invite email), and `functions/src/routes/email.js`'s `POST /send` (an ad-hoc "compose and send to arbitrary recipients" endpoint used by two frontend components, `src/components/email/SendEmailPanel.tsx` and `src/components/email/SendContactsToTeammate.tsx`, both calling `sendEmail()` in `src/lib/api.ts`).
- `nodemailer` is already a dependency in `functions/package.json` (`^8.0.1`) but currently unused anywhere in `functions/src/`.
- `.env.example` still documents `GMAIL_USER`/`GMAIL_APP_PASSWORD` under a "Gmail (for sending emails from the app)" comment — a leftover from before the Brevo switch; nothing in the current code reads them.
- **This project already tried raw Gmail SMTP on Railway and it failed.** Git history (`git log --oneline --all -- functions/src/lib/emailService.js`) shows, in order: `Force IPv4 DNS at Node.js level for Gmail SMTP`, `Manually resolve smtp.gmail.com to IPv4 address`, `Switch to port 465 SSL — port 587 may be blocked on Railway`, then `Switch from Gmail SMTP to Resend API`, then `Switch to Brevo (Sendinblue) for email sending`. The user was told this directly and chose to retry Gmail SMTP anyway. This spec starts from the *last* configuration that project attempted (port 465, SSL, IPv4-forced DNS) rather than from scratch, and includes a fast diagnostic (a test-send button) specifically because a repeat of this exact failure is a real, not hypothetical, risk.
- `functions/src/routes/users.js`'s `PUT /:id` (admin-only, edits any user) and `authenticateToken`'s Prisma `select` (in `functions/src/middleware/auth.js`) currently select only `id, username, email, role, isActive` — no email-sending fields exist on `User` yet.
- `Sidebar.tsx`'s per-user account dropdown (bottom-left avatar + username + role, `DropdownMenu` triggered by clicking it) currently has three items: Upload, Files, Logout (`src/components/layout/Sidebar.tsx:137-148`). Its lucide-react import line is `import { Building2, ChevronDown, FileText, LogOut, Settings, Upload, Users } from 'lucide-react'` — no `Mail` icon yet. `TopBar.tsx` has an equivalent mobile-menu list with the same two non-logout items, and its own icon import line (`Bell, FileText, LogOut, Menu, RefreshCw, Search, Settings, Upload, Users, X`) also has no `Mail` yet. Both are wired through `AppShell.tsx`, which owns `isManagerViewOpen` state and passes `onOpenManagerView` down to both, rendering `<ManagerViewDialog>` itself — the established pattern for a dialog reachable from both nav surfaces.

## Part 1: SMTP sending, Brevo deactivated

### `functions/src/lib/emailService.js`

Restructured into three named functions, replacing the current single `sendEmail`:

```js
const nodemailer = require('nodemailer');
const dns = require('dns');
// Mitigates the exact failure this project hit before: Railway's DNS
// resolution preferring an unreachable IPv6 route to smtp.gmail.com.
dns.setDefaultResultOrder('ipv4first');

let transport = null;

function getTransport(auth) {
  // A per-call auth override (the per-user feature in Part 3) never reuses
  // the cached system transport — different credentials need their own
  // connection. The system transport (no override) is cached once.
  if (!auth && transport) return transport;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const built = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: auth || {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 20000,
  });

  if (!auth) transport = built;
  return built;
}

/**
 * Sends via raw SMTP (nodemailer). `auth`, when given, overrides the
 * system Gmail account with a specific user's own credentials (Part 3) —
 * omit it for system emails (password reset, invites).
 */
async function sendEmailSmtp({ to, subject, text, auth }) {
  const from = (auth && auth.user) || process.env.GMAIL_USER;
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];
  const client = getTransport(auth);
  for (const recipient of recipients) {
    const info = await client.sendMail({ from, to: recipient.trim(), subject, text });
    console.log(`[EMAIL] Sent to ${recipient} via SMTP -- messageId: ${info.messageId}`);
    results.push(info);
  }
  return results;
}

// ============================================================================
// DEACTIVATED — kept intact for a fast reactivation later, not called by
// anything in this codebase right now. Do not delete; do not "clean up."
// ============================================================================
let brevoClient = null;

function getBrevoClient() {
  if (brevoClient) return brevoClient;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY environment variable is required');
  const { BrevoClient } = require('@getbrevo/brevo');
  brevoClient = new BrevoClient({ apiKey });
  return brevoClient;
}

async function sendEmailBrevo({ to, subject, text }) {
  const brevo = getBrevoClient();
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'Raul.Medina@rbmventuresgroup.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Raul Medina';
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];
  for (const recipient of recipients) {
    const data = await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipient.trim() }],
      subject,
      textContent: text,
    });
    console.log(`[EMAIL] Sent to ${recipient} via Brevo -- messageId: ${data.messageId}`);
    results.push(data);
  }
  return results;
}
// ============================================================================

module.exports = {
  sendEmail: sendEmailSmtp, // the active entry point every call site uses
  sendEmailSmtp,
  sendEmailBrevo, // exported but unused — available for a fast reactivation
};
```

Existing call sites (`auth.js`'s two routes, `email.js`'s `/send`) import `{ sendEmail }` exactly as they do today — no call-site signature change for the system path. `sendEmail` now resolves to `sendEmailSmtp`, not Brevo. `require('@getbrevo/brevo')` moves inside `getBrevoClient()` (lazy) so the package only loads if Brevo is ever actually called again.

**New/changed environment variables:** `GMAIL_USER`, `GMAIL_APP_PASSWORD` (a 16-character Gmail App Password, not the account password — requires 2-Step Verification enabled on that Google account), both required for the system account to work. `SMTP_HOST` (default `smtp.gmail.com`) and `SMTP_PORT` (default `465`) are optional overrides, present so a future provider switch (per the user's reference doc) is a config change, not a code change. `BREVO_API_KEY` etc. stay valid but unused.

**Rollout note:** the user must set/confirm `GMAIL_USER` and `GMAIL_APP_PASSWORD` in Railway's production environment before this works — this is a deployment step, not a code change, and is called out again in the plan's final task.

## Part 2: Outbox + idempotency for password-reset and invites

### Idempotency, scoped correctly

The reference doc's `UNIQUE(lead_id, template_key)` exists to protect a *recurring daily job* from re-processing the same renter. This CRM has no equivalent job — both emails here are synchronous, one-shot, user-triggered actions, and a user legitimately can request a second password reset or send a second invite later. Deduping on `(user, template)` globally would silently block that. Instead, each outbox row dedupes against the *specific event* that produced it:

- Password reset: `dedupeKey` = the hashed reset token already generated for that request (`hashedToken` in `auth.js`'s `/forgot-password` — the same value already written to `user.resetToken`). A genuine second request generates a new token and thus a new `dedupeKey`; only an exact retry of the same request (same token) would collide.
- Invite: `dedupeKey` = the newly-created `Invite` row's own `id`. A new invite (even to the same email) is a new row with a new id.

### `functions/prisma/schema.prisma`

New model, placed near `Invite` (alphabetically/thematically grouped with auth-adjacent models):

```prisma
model EmailMessage {
  id             String    @id @default(cuid())
  templateKey    String    // 'password_reset' | 'invite'
  dedupeKey      String    // hashed reset token, or the Invite's id
  recipientEmail String
  subject        String
  bodyText       String    @db.Text
  status         String    @default("queued") // queued | sent | failed
  errorMessage   String?   @db.Text
  createdAt      DateTime  @default(now())
  sentAt         DateTime?
  updatedAt      DateTime  @updatedAt

  @@unique([templateKey, dedupeKey])
  @@index([recipientEmail])
  @@index([status])
  @@map("email_messages")
}
```

Lands via the existing `prisma db push` deploy mechanism (`start.sh`), same as every other schema change in this project — no migration file needs to run.

### `functions/src/lib/emailOutbox.js` (new)

```js
const defaultPrisma = require('./prisma');
const { sendEmailSmtp: defaultSendEmailSmtp } = require('./emailService');

/**
 * Write-first send: the row is inserted as 'queued' and committed before
 * any network call, so a slow or down mail server never loses the record
 * of what should have been sent — it just leaves a row.
 *
 * A second call with the same (templateKey, dedupeKey) returns the
 * existing row untouched rather than sending again.
 *
 * `db` and `send` default to the real Prisma client and the real SMTP
 * sender — every production call site omits them and gets those defaults.
 * Tests pass fakes for both instead, which avoids ever loading Prisma's
 * native query-engine binary in the test process (a known pre-existing
 * issue in this sandbox, unrelated to this code) and avoids needing any
 * module-mocking setup.
 */
async function sendOnce({ templateKey, dedupeKey, to, subject, text, db = defaultPrisma, send = defaultSendEmailSmtp }) {
  const existing = await db.emailMessage.findUnique({
    where: { templateKey_dedupeKey: { templateKey, dedupeKey } },
  });
  if (existing) return existing;

  const recipientEmail = Array.isArray(to) ? to[0] : to;
  let row;
  try {
    row = await db.emailMessage.create({
      data: { templateKey, dedupeKey, recipientEmail, subject, bodyText: text, status: 'queued' },
    });
  } catch (err) {
    // A concurrent request won the race and created the row first —
    // the unique constraint is the real guarantee, this just avoids a
    // duplicate-send if two requests for the same event land together.
    if (err.code === 'P2002') {
      return db.emailMessage.findUnique({
        where: { templateKey_dedupeKey: { templateKey, dedupeKey } },
      });
    }
    throw err;
  }

  let status = 'sent';
  let errorMessage = null;
  try {
    await send({ to, subject, text });
  } catch (err) {
    status = 'failed';
    errorMessage = String(err.message || err).slice(0, 500);
  }

  return db.emailMessage.update({
    where: { id: row.id },
    data: { status, errorMessage, sentAt: status === 'sent' ? new Date() : null },
  });
}

module.exports = { sendOnce };
```

(Prisma's generated compound-unique field name for `@@unique([templateKey, dedupeKey])` is `templateKey_dedupeKey` — the plan verifies this against the actual generated client before writing code that depends on it.)

### `functions/src/routes/auth.js` changes

Replace the existing import (`const { sendEmail } = require('../lib/emailService');`) with:

```js
const { sendOnce } = require('../lib/emailOutbox');
```

`POST /forgot-password`: replace the `sendEmail({...})` call (currently wrapped in its own try/catch that swallows failures — that behavior is preserved) with:

```js
try {
  await sendOnce({
    templateKey: 'password_reset',
    dedupeKey: hashedToken,
    to: [user.email],
    subject: 'Reset your password',
    text: `We received a request to reset your password.\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
  });
} catch (emailError) {
  console.error('[AUTH] Failed to send password reset email:', emailError);
}
```

`POST /invites`: same shape, using `dedupeKey: invite.id` and `templateKey: 'invite'`. The response to the client is unaffected either way — both routes already treat email delivery as best-effort and respond successfully regardless (the existing, deliberate behavior for not leaking account-existence / for letting an admin re-invite if delivery failed).

## Part 3: Per-user SMTP for the compose feature

### `functions/prisma/schema.prisma`

Add to `User`:

```prisma
smtpUsername    String?
smtpAppPassword String?
```

**Security note, stated plainly rather than decided silently:** these are stored in plaintext, matching this codebase's existing pattern (nothing else here is encrypted at rest beyond password hashes). A Gmail App Password only grants that one app's SMTP/IMAP access — not the full account — and can be individually revoked from the user's Google account at any time, which is why this is a reasonable default rather than a real gap. Encryption at rest can be added later without changing this design's shape if wanted.

### `functions/src/routes/email.js` changes

New routes, self-service (the caller's own row only, identified by `req.user.id` — no admin override). `email.js` currently imports `const { sendEmail } = require('../lib/emailService');` and has no Prisma import at all — change the top of the file to:

```js
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { sendEmail, sendEmailSmtp } = require('../lib/emailService');

// GET /api/email/settings
router.get('/settings', authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { smtpUsername: true, smtpAppPassword: true },
  });
  res.json({ configured: !!(user.smtpUsername && user.smtpAppPassword), smtpUsername: user.smtpUsername });
});

// PUT /api/email/settings
router.put('/settings',
  authenticateToken,
  [
    body('smtpUsername').isEmail().normalizeEmail().withMessage('A valid email address is required'),
    body('smtpAppPassword').isLength({ min: 1 }).withMessage('App password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { smtpUsername, smtpAppPassword } = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { smtpUsername, smtpAppPassword },
    });
    res.json({ configured: true });
  }
);

// DELETE /api/email/settings
router.delete('/settings', authenticateToken, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { smtpUsername: null, smtpAppPassword: null },
  });
  res.json({ configured: false });
});

// POST /api/email/test — sends one email to the caller's own account email,
// using their saved SMTP credentials. Reports the exact error on failure,
// per the reference doc's own advice: "the fastest way to find a wrong
// port or password."
router.post('/test', authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { email: true, smtpUsername: true, smtpAppPassword: true },
  });
  if (!user.smtpUsername || !user.smtpAppPassword) {
    return res.status(400).json({ error: 'Set up your email first' });
  }
  try {
    await sendEmailSmtp({
      to: [user.email],
      subject: 'Test email from Bexar CRE Acquisition CRM',
      text: 'If you got this, your email is set up correctly.',
      auth: { user: user.smtpUsername, pass: user.smtpAppPassword },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(200).json({ success: false, error: String(err.message || err) });
  }
});
```

`POST /send` (the existing ad-hoc compose endpoint) changes to use the caller's own credentials when set:

```js
router.post('/send', authenticateToken, async (req, res) => {
  try {
    // ...existing recipient-normalization logic, unchanged...

    const sender = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { smtpUsername: true, smtpAppPassword: true },
    });
    const auth = (sender.smtpUsername && sender.smtpAppPassword)
      ? { user: sender.smtpUsername, pass: sender.smtpAppPassword }
      : undefined; // falls back to the system GMAIL_USER/GMAIL_APP_PASSWORD

    await sendEmail({ to: recipients, subject, text: body, auth });

    res.json({ success: true, sent: recipients.length });
  } catch (error) {
    // ...existing error handling...
  }
});
```

This dedicated lookup (rather than adding these two fields to `authenticateToken`'s shared `select`) keeps the app password out of `req.user` on every authenticated request across the whole app — it's only ever read on the two routes that need it.

### Frontend: `src/lib/api.ts`

```ts
export interface EmailSettings {
  configured: boolean;
  smtpUsername: string | null;
}

export async function getMyEmailSettings(): Promise<EmailSettings> {
  const response = await fetch(`${API_BASE_URL}/api/email/settings`, { headers: getAuthHeaders() });
  if (!response.ok) throw new Error('Failed to load email settings');
  return response.json();
}

export async function setMyEmailSettings(smtpUsername: string, smtpAppPassword: string): Promise<{ configured: true }> {
  const response = await fetch(`${API_BASE_URL}/api/email/settings`, {
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

export async function clearMyEmailSettings(): Promise<{ configured: false }> {
  const response = await fetch(`${API_BASE_URL}/api/email/settings`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to clear email settings');
  return response.json();
}

export async function sendTestEmail(): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/email/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send test email');
  }
  return response.json();
}
```

### Frontend: `src/components/layout/EmailSettingsDialog.tsx` (new)

Mirrors `ManagerViewDialog.tsx`'s structure (same `Dialog`/`DialogContent`/`DialogHeader` shell, same `isOpen`/`onClose` prop pattern). On open, calls `getMyEmailSettings()` to show current state (`configured` + the saved `smtpUsername`, never the password). Two fields — Gmail address, App Password — a **Save** button (`setMyEmailSettings`), a **Send test email to myself** button (`sendTestEmail`, showing the exact success/error message inline, not just a toast, so a wrong port/password is immediately visible), and — only when already configured — a **Deactivate** button (`clearMyEmailSettings`) that clears both fields and resets the form.

### Wiring: `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`

`AppShell.tsx` gains `isEmailSettingsOpen` state (mirroring `isManagerViewOpen`) and passes `onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}` to both `Sidebar` and `TopBar`, rendering `<EmailSettingsDialog isOpen={isEmailSettingsOpen} onClose={() => setIsEmailSettingsOpen(false)} />` alongside the existing `<ManagerViewDialog>`.

`Sidebar.tsx`: add `Mail` to its existing lucide-react import line, then a new `DropdownMenuItem` in the per-user account dropdown (the one this feature request specifically points at — bottom-left avatar/username/role button), between the existing "Files" and "Logout" items:

```tsx
<DropdownMenuItem onClick={onOpenEmailSettings}>
  <Mail className="h-4 w-4 mr-2" />
  Email Settings
</DropdownMenuItem>
```

`TopBar.tsx`: add `Mail` to its existing lucide-react import line, then a matching button in its equivalent mobile-menu list, in the same relative position, following that file's existing `Button`-list pattern rather than `DropdownMenuItem` (its menu isn't a `DropdownMenu`).

This is available to every signed-in user, not admin-gated — unlike "Manager Settings," this is each person's own account setting.

## Testing Plan

- `functions/src/lib/emailOutbox.test.js` (new): the write-first/idempotency logic is the one piece of new business logic worth unit-testing directly, per this repo's established convention (pure logic in `lib/` gets tests; routes don't). `emailOutbox.js`'s `db`/`send` default parameters (shown above) are what make this testable without loading Prisma's native binary or reaching for module mocking — a test calls `sendOnce({ ..., db: fakeDb, send: fakeSend })` with plain fake objects (`fakeDb.emailMessage = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }`, `fakeSend = vi.fn()`). Cases: a second call with the same `(templateKey, dedupeKey)` (fake `findUnique` returns a row) returns that row without calling `send`; a failed send (`send` rejects) is recorded as `status: 'failed'` with the error message via the fake `update` call's arguments, not thrown; a successful send records `status: 'sent'` and a `sentAt` date; a `create` that throws `{ code: 'P2002' }` falls back to `findUnique` instead of propagating.
- No new tests for `auth.js`'s two routes or `email.js`'s routes, consistent with this repo's zero route-level test coverage convention.
- `EmailSettingsDialog.test.tsx` (new, matching `TeamView.test.tsx`'s established mocking pattern): loads and shows current `configured` state; saving calls `setMyEmailSettings` with the entered values; the test-send button shows the returned error message inline on failure.

## Out of Scope

- Actually reactivating Brevo (the user will ask for this explicitly later if SMTP doesn't work out).
- Encrypting `smtpUsername`/`smtpAppPassword` at rest (named above as a conscious, revisitable tradeoff).
- Any outbox/idempotency handling for the ad-hoc compose endpoint (`POST /send`) — the user explicitly chose to leave it as a direct swap with no dedup layer.
- A daily/recurring email job of any kind — this CRM has none today and this spec doesn't add one.
- Creating the 4 test user accounts the user asked for — that requires actually logging into the deployed CRM as an admin, which needs credentials this session doesn't have. Once this ships, the user (or someone with admin access) sends those invites through the existing Team tab, which doubles as the real end-to-end test of whether Gmail SMTP actually works from Railway this time.
