# SMTP Email + Per-User Sending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Brevo with raw SMTP (nodemailer + Gmail) for the CRM's system emails, add a write-first outbox table with per-event idempotency for password-reset and invites, and let any signed-in user self-activate their own Gmail SMTP credentials for the ad-hoc "compose and send" feature.

**Architecture:** `emailService.js` gains an SMTP sender (nodemailer) as the active `sendEmail` path while the existing Brevo sender stays intact but uncalled. A new outbox table + `emailOutbox.js` wrapper gives password-reset and invite emails a queued/sent/failed record with per-event (not per-user) deduplication. Two new nullable `User` fields plus new self-service routes and a new dialog let each user paste in their own Gmail address + App Password, which the compose endpoint then prefers over the shared system account.

**Tech Stack:** Express + Prisma + PostgreSQL backend (`functions/src/`), React 19 + TypeScript frontend (`src/`), `nodemailer` (already a dependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-smtp-email-and-per-user-sending-design.md`

## Global Constraints

- Brevo's existing code (`sendEmailBrevo`, the Brevo client) is never deleted or modified beyond being renamed and moved — it must remain fully functional and easy to reactivate later. Nothing calls it after this plan.
- Idempotency for password-reset and invite emails is scoped to the *specific event* (the reset token's hash, or the Invite row's own id) — never to `(user, templateKey)` alone. A user must be able to request a second password reset or receive a second invite later without being silently blocked.
- No new backend route-level tests — this repo has zero route/middleware test coverage by established convention. Pure logic in `functions/src/lib/` gets unit tests; route wiring does not.
- `emailOutbox.js`'s `sendOnce()` takes `db` and `send` as parameters defaulting to the real Prisma client and the real `sendEmailSmtp` — this is what makes it testable without loading Prisma's native query-engine binary (a known pre-existing sandbox issue) or needing module mocking. Do not remove these parameters "for simplicity."
- Per-user `smtpUsername`/`smtpAppPassword` are stored in plaintext, matching this codebase's existing pattern (nothing else here is encrypted at rest beyond password hashes) — this is a documented, deliberate tradeoff, not an oversight to "fix" during implementation.
- The per-user email settings feature is available to every signed-in user, not admin-gated — do not reuse the `isAdmin` gating pattern from Sidebar's "Settings" button for this.
- Schema changes land via this project's `prisma db push` deploy mechanism (`functions/start.sh` runs it on every boot) — there is no migration file to write or run.

---

### Task 1: Restructure `emailService.js` — SMTP active, Brevo deactivated

**Files:**
- Modify: `functions/src/lib/emailService.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sendEmail` (now = `sendEmailSmtp`), `sendEmailSmtp({ to, subject, text, auth? })`, `sendEmailBrevo({ to, subject, text })` (unused but exported), all from `functions/src/lib/emailService.js`. `sendEmailSmtp`'s optional `auth: { user, pass }` parameter overrides the system Gmail account — omitted for system emails, provided for per-user sends (Task 4). Tasks 2, 3, and 4 all consume `sendEmailSmtp` and/or `sendEmail` from this file.

This repo has no test file for `emailService.js` and none should be added (SMTP/network code, not pure logic — see Global Constraints). Verification is the full test suite plus a build check.

- [ ] **Step 1: Read the current file**

Open `functions/src/lib/emailService.js` and confirm it currently reads exactly:

```js
const { BrevoClient } = require('@getbrevo/brevo');

let client = null;

function getClient() {
  if (client) return client;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is required');
  }

  client = new BrevoClient({ apiKey });
  return client;
}

async function sendEmail({ to, subject, text }) {
  const brevo = getClient();

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'Raul.Medina@rbmventuresgroup.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Raul Medina';

  const recipients = Array.isArray(to) ? to : [to];

  // Send each email individually so recipients can't see each other
  const results = [];
  for (const recipient of recipients) {
    const data = await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipient.trim() }],
      subject,
      textContent: text,
    });
    console.log(`[EMAIL] Sent to ${recipient} -- messageId: ${data.messageId}`);
    results.push(data);
  }

  return results;
}

module.exports = { sendEmail };
```

If this doesn't match exactly, stop and report — the file has changed since this plan was written.

- [ ] **Step 2: Replace the whole file**

Replace the entire contents of `functions/src/lib/emailService.js` with:

```js
const nodemailer = require('nodemailer');
const dns = require('dns');
// Mitigates the exact failure this project hit before: Railway's DNS
// resolution preferring an unreachable IPv6 route to smtp.gmail.com.
dns.setDefaultResultOrder('ipv4first');

let transport = null;

function getTransport(auth) {
  // A per-call auth override (the per-user feature) never reuses the
  // cached system transport — different credentials need their own
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
 * system Gmail account with a specific user's own credentials — omit it
 * for system emails (password reset, invites).
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
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is required');
  }
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

Note `require('@getbrevo/brevo')` moved inside `getBrevoClient()` (lazy) — the package only loads if Brevo is ever actually called again, which nothing does after this plan.

- [ ] **Step 3: Confirm no other file imports the removed `getClient`/`client` names**

Run: `grep -rn "getClient" functions/src/`
Expected: no matches (the old internal `getClient`/`client` names were never exported, so nothing outside this file could reference them).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all existing tests pass (this file has no dedicated tests — you're checking for regressions elsewhere, of which there should be none, since `sendEmail`'s exported shape — a function taking `{to, subject, text}` and returning a promise of results — is unchanged from the caller's perspective).

- [ ] **Step 5: Add the new environment variables to `.env.example`**

Open `.env.example`. It currently has, near the top:

```
# Gmail (for sending emails from the app)
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="your-16-char-app-password"
```

These lines already exist and are already correct — leave them as-is. Confirm this by running: `grep -n "GMAIL_USER\|GMAIL_APP_PASSWORD" .env.example` — expected: both lines found, matching the text above exactly. If they don't match or aren't found, add them in that exact form, positioned near the other server-configuration variables.

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/emailService.js
git commit -m "feat: switch active email sending from Brevo to raw SMTP, keep Brevo deactivated"
```

---

### Task 2: `EmailMessage` outbox model + `emailOutbox.js`

**Files:**
- Modify: `functions/prisma/schema.prisma`
- Create: `functions/src/lib/emailOutbox.js`
- Create: `functions/src/lib/emailOutbox.test.js`

**Interfaces:**
- Consumes: `sendEmailSmtp` from `functions/src/lib/emailService.js` (Task 1) as the default `send` parameter.
- Produces: `sendOnce({ templateKey, dedupeKey, to, subject, text, db?, send? })` from `functions/src/lib/emailOutbox.js`, returning the resulting `EmailMessage` row (existing, or newly created and updated). `db` defaults to the real Prisma client; `send` defaults to `sendEmailSmtp`. Task 3 consumes `sendOnce` with its two real call sites (`templateKey: 'password_reset'` and `templateKey: 'invite'`).

- [ ] **Step 1: Add the `EmailMessage` model to `schema.prisma`**

Open `functions/prisma/schema.prisma` and find the `Invite` model. Immediately after it (or immediately before, either is fine — keep it near `Invite` since both are auth-adjacent), add:

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

- [ ] **Step 2: Generate the Prisma client and confirm the compound-unique field name**

Run (from the repo root): `cd functions && npx prisma generate && cd ..`

Then confirm Prisma's generated name for the `@@unique([templateKey, dedupeKey])` constraint matches `templateKey_dedupeKey` (the default naming convention — field names in declared order, joined by `_`). Run:

`grep -n "templateKey_dedupeKey" functions/node_modules/.prisma/client/index.d.ts`

Expected: at least one match (e.g. inside a generated `EmailMessageWhereUniqueInput` type). If there is no match, search the same file for `EmailMessageWhereUniqueInput` to find the actual generated field name Prisma used instead, and use that exact name in Step 3 below rather than `templateKey_dedupeKey`.

If `npx prisma generate` fails in your environment for an unrelated reason (e.g. it tries to reach a network resource that's unavailable), do not treat this as blocking — proceed with `templateKey_dedupeKey`, which is Prisma's standard, documented default for this exact declaration, and note in your report that the generate step could not be run.

- [ ] **Step 3: Write the failing tests**

Create `functions/src/lib/emailOutbox.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { sendOnce } from './emailOutbox.js';

function makeFakeDb(overrides = {}) {
  return {
    emailMessage: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'row-1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'row-1', ...data })),
      ...overrides,
    },
  };
}

describe('sendOnce', () => {
  it('returns the existing row without sending, when one already exists for this templateKey+dedupeKey', async () => {
    const existingRow = { id: 'row-1', status: 'sent' };
    const db = makeFakeDb({ findUnique: vi.fn().mockResolvedValue(existingRow) });
    const send = vi.fn();

    const result = await sendOnce({
      templateKey: 'password_reset',
      dedupeKey: 'abc123',
      to: ['a@example.com'],
      subject: 'Reset your password',
      text: 'body',
      db,
      send,
    });

    expect(result).toBe(existingRow);
    expect(send).not.toHaveBeenCalled();
    expect(db.emailMessage.create).not.toHaveBeenCalled();
  });

  it('records a successful send as status sent with a sentAt date', async () => {
    const db = makeFakeDb();
    const send = vi.fn().mockResolvedValue([{ messageId: 'x' }]);

    await sendOnce({
      templateKey: 'invite',
      dedupeKey: 'invite-1',
      to: ['b@example.com'],
      subject: 'You are invited',
      text: 'body',
      db,
      send,
    });

    expect(send).toHaveBeenCalledWith({ to: ['b@example.com'], subject: 'You are invited', text: 'body' });
    expect(db.emailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-1' },
        data: expect.objectContaining({ status: 'sent', errorMessage: null }),
      }),
    );
    const updateCall = db.emailMessage.update.mock.calls[0][0];
    expect(updateCall.data.sentAt).toBeInstanceOf(Date);
  });

  it('records a failed send as status failed with the error message, without throwing', async () => {
    const db = makeFakeDb();
    const send = vi.fn().mockRejectedValue(new Error('SMTP connection refused'));

    const result = await sendOnce({
      templateKey: 'password_reset',
      dedupeKey: 'def456',
      to: ['c@example.com'],
      subject: 'Reset your password',
      text: 'body',
      db,
      send,
    });

    expect(db.emailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-1' },
        data: expect.objectContaining({ status: 'failed', errorMessage: 'SMTP connection refused', sentAt: null }),
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('falls back to findUnique instead of throwing, when create hits a concurrent duplicate (P2002)', async () => {
    const existingRow = { id: 'row-1', status: 'sent' };
    const findUnique = vi.fn()
      .mockResolvedValueOnce(null) // first check: no row yet
      .mockResolvedValueOnce(existingRow); // after the P2002 catch: the row a concurrent request just created
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    const db = makeFakeDb({ findUnique, create });
    const send = vi.fn();

    const result = await sendOnce({
      templateKey: 'invite',
      dedupeKey: 'invite-2',
      to: ['d@example.com'],
      subject: 'You are invited',
      text: 'body',
      db,
      send,
    });

    expect(result).toBe(existingRow);
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run functions/src/lib/emailOutbox.test.js`
Expected: FAIL — `./emailOutbox.js` does not exist yet.

- [ ] **Step 5: Implement `emailOutbox.js`**

Create `functions/src/lib/emailOutbox.js`:

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
 * sender — every production call site omits them and gets those
 * defaults. Tests pass fakes for both instead, which avoids ever loading
 * Prisma's native query-engine binary in the test process and avoids
 * needing any module-mocking setup.
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
    // A concurrent request won the race and created the row first — the
    // unique constraint is the real guarantee, this just avoids a
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

If Step 2 found a different generated field name than `templateKey_dedupeKey`, use that exact name in both `where: { ... }` clauses above instead.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run functions/src/lib/emailOutbox.test.js`
Expected: PASS — all 4 tests.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/lib/emailOutbox.js functions/src/lib/emailOutbox.test.js
git commit -m "feat: add EmailMessage outbox table and write-first sendOnce()"
```

---

### Task 3: Wire `auth.js`'s forgot-password and invites through the outbox

**Files:**
- Modify: `functions/src/routes/auth.js`

**Interfaces:**
- Consumes: `sendOnce` from `functions/src/lib/emailOutbox.js` (Task 2).
- Produces: nothing new consumed by a later task.

No test file for this task — route-level code isn't unit-tested in this repo (see Global Constraints).

- [ ] **Step 1: Update the import**

Find, near the top of `functions/src/routes/auth.js`:

```js
const { sendEmail } = require('../lib/emailService');
```

Replace with:

```js
const { sendOnce } = require('../lib/emailOutbox');
```

- [ ] **Step 2: Confirm `sendEmail` is called exactly twice, and find both call sites**

Run: `grep -n "sendEmail(" functions/src/routes/auth.js`

Expected: exactly 2 matches — one inside `POST /forgot-password`, one inside `POST /invites`. If there are more or fewer, stop and report — this plan's Step 3 and Step 4 assume exactly these two.

- [ ] **Step 3: Update the `/forgot-password` call site**

Find:

```js
        try {
          await sendEmail({
            to: [user.email],
            subject: 'Reset your password',
            text: `We received a request to reset your password.\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
          });
        } catch (emailError) {
```

Replace the `sendEmail({...})` call (only — the surrounding `try`/`catch` structure and the `catch` block's contents are unchanged) with:

```js
          await sendOnce({
            templateKey: 'password_reset',
            dedupeKey: hashedToken,
            to: [user.email],
            subject: 'Reset your password',
            text: `We received a request to reset your password.\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
          });
```

(`hashedToken` is already in scope — it's the same variable computed a few lines earlier in this handler and written to `user.resetToken`.)

- [ ] **Step 4: Update the `/invites` call site**

Find:

```js
      try {
        await sendEmail({
          to: [email],
          subject: "You're invited to Bexar CRE Acquisition CRM",
          text: `${req.user.username} has invited you to join the team.\n\n${signupUrl}\n\nThis link expires in 7 days and can only be used once.`,
        });
      } catch (emailError) {
```

Replace the `sendEmail({...})` call (only) with:

```js
        await sendOnce({
          templateKey: 'invite',
          dedupeKey: invite.id,
          to: [email],
          subject: "You're invited to Bexar CRE Acquisition CRM",
          text: `${req.user.username} has invited you to join the team.\n\n${signupUrl}\n\nThis link expires in 7 days and can only be used once.`,
        });
```

(`invite` is already in scope — the row created a few lines earlier via `prisma.invite.create(...)`.)

- [ ] **Step 5: Confirm no dangling reference to the old import**

Run: `grep -n "sendEmail(" functions/src/routes/auth.js`
Expected: no matches (both call sites now say `sendOnce`).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add functions/src/routes/auth.js
git commit -m "feat: route password-reset and invite emails through the write-first outbox"
```

---

### Task 4: Per-user SMTP credentials — schema + backend routes

**Files:**
- Modify: `functions/prisma/schema.prisma`
- Modify: `functions/src/routes/email.js`

**Interfaces:**
- Consumes: `sendEmail`, `sendEmailSmtp` from `functions/src/lib/emailService.js` (Task 1).
- Produces: `GET /api/email/settings` → `{ configured: boolean, smtpUsername: string | null }`; `PUT /api/email/settings` (body `{ smtpUsername, smtpAppPassword }`) → `{ configured: true }`; `DELETE /api/email/settings` → `{ configured: false }`; `POST /api/email/test` → `{ success: true }` or `{ success: false, error: string }`. All four require authentication and act on the caller's own account only (`req.user.id`). Task 5 (frontend `src/lib/api.ts`) consumes these four endpoints' exact request/response shapes.

No test file for this task — route-level code isn't unit-tested in this repo (see Global Constraints).

- [ ] **Step 1: Add the two fields to the `User` model**

Open `functions/prisma/schema.prisma`, find the `User` model, and add these two fields to it (position doesn't matter functionally — add them near other optional profile-ish fields if there's a natural spot, otherwise at the end of the model's scalar fields, before its relations):

```prisma
  smtpUsername    String?
  smtpAppPassword String?
```

- [ ] **Step 2: Update the top of `functions/src/routes/email.js`**

Find:

```js
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../lib/emailService');
const { authenticateToken } = require('../middleware/auth');
```

Replace with:

```js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { sendEmail, sendEmailSmtp } = require('../lib/emailService');
const { authenticateToken } = require('../middleware/auth');
```

- [ ] **Step 3: Update the `POST /send` handler to prefer the caller's own credentials**

Find, inside the existing `POST /send` handler, the line:

```js
    await sendEmail({
      to: recipients,
      subject,
      text: body,
    });
```

Replace it with:

```js
    const sender = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { smtpUsername: true, smtpAppPassword: true },
    });
    const auth = (sender.smtpUsername && sender.smtpAppPassword)
      ? { user: sender.smtpUsername, pass: sender.smtpAppPassword }
      : undefined; // falls back to the system GMAIL_USER/GMAIL_APP_PASSWORD

    await sendEmail({
      to: recipients,
      subject,
      text: body,
      auth,
    });
```

Nothing else in this handler (the recipient-normalization logic above it, or the `catch` block below it) changes.

- [ ] **Step 4: Add the four new routes**

Add these four routes to `functions/src/routes/email.js`, after the existing `POST /send` route and before `module.exports = router;`:

```js
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

// POST /api/email/test — sends one email to the caller's own account
// email, using their saved SMTP credentials. Reports the exact error on
// failure, so a wrong port/password is immediately visible.
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

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/routes/email.js
git commit -m "feat: add self-service per-user SMTP settings, prefer them in the compose endpoint"
```

---

### Task 5: Frontend API functions + `EmailSettingsDialog.tsx`

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/components/layout/EmailSettingsDialog.tsx`
- Create: `src/components/layout/EmailSettingsDialog.test.tsx`

**Interfaces:**
- Consumes: `GET/PUT/DELETE /api/email/settings`, `POST /api/email/test` from `functions/src/routes/email.js` (Task 4).
- Produces: `getMyEmailSettings()`, `setMyEmailSettings(smtpUsername, smtpAppPassword)`, `clearMyEmailSettings()`, `sendTestEmail()`, and the `EmailSettings` type, all from `src/lib/api.ts`. `EmailSettingsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void })`, default export, from `src/components/layout/EmailSettingsDialog.tsx`. Task 6 consumes both.

- [ ] **Step 1: Add the API functions to `src/lib/api.ts`**

Add this block anywhere in `src/lib/api.ts` (e.g., near the existing `EMAIL` section that has `sendEmail`):

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

- [ ] **Step 2: Write the failing tests for `EmailSettingsDialog.tsx`**

Create `src/components/layout/EmailSettingsDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailSettingsDialog from './EmailSettingsDialog';

const mockGetSettings = vi.fn();
const mockSetSettings = vi.fn();
const mockClearSettings = vi.fn();
const mockSendTest = vi.fn();

vi.mock('@/lib/api', () => ({
  getMyEmailSettings: () => mockGetSettings(),
  setMyEmailSettings: (u: string, p: string) => mockSetSettings(u, p),
  clearMyEmailSettings: () => mockClearSettings(),
  sendTestEmail: () => mockSendTest(),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettings.mockResolvedValue({ configured: false, smtpUsername: null });
});

describe('EmailSettingsDialog', () => {
  it('loads and shows the not-configured state', async () => {
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull();
  });

  it('saves the entered address and app password', async () => {
    const user = userEvent.setup();
    mockSetSettings.mockResolvedValue({ configured: true });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/gmail address/i), 'me@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith('me@gmail.com', 'abcd efgh ijkl mnop'));
  });

  it('shows the exact error message inline when the test send fails', async () => {
    const user = userEvent.setup();
    mockGetSettings.mockResolvedValue({ configured: true, smtpUsername: 'me@gmail.com' });
    mockSendTest.mockResolvedValue({ success: false, error: 'Invalid login: 535-5.7.8' });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    expect(await screen.findByText('Invalid login: 535-5.7.8')).toBeTruthy();
  });

  it('shows a Deactivate button once configured, and clears settings when clicked', async () => {
    const user = userEvent.setup();
    mockGetSettings.mockResolvedValue({ configured: true, smtpUsername: 'me@gmail.com' });
    mockClearSettings.mockResolvedValue({ configured: false });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => expect(mockClearSettings).toHaveBeenCalled());
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/layout/EmailSettingsDialog.test.tsx`
Expected: FAIL — `./EmailSettingsDialog` does not exist yet.

- [ ] **Step 4: Implement `EmailSettingsDialog.tsx`**

Create `src/components/layout/EmailSettingsDialog.tsx`, modeled directly on the existing `ManagerViewDialog.tsx` (same `Dialog`/`DialogContent`/`DialogHeader` shell and prop pattern):

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

/**
 * Lets any signed-in user paste in their own Gmail address + App
 * Password so the "compose and send" feature goes out from their own
 * address instead of the shared system account. Not admin-gated —
 * every user's own setting.
 */
export default function EmailSettingsDialog({ isOpen, onClose }: EmailSettingsDialogProps) {
  const [configured, setConfigured] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
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
      const result = await sendTestEmail();
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
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !configured}>
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout/EmailSettingsDialog.test.tsx`
Expected: PASS — all 4 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api.ts src/components/layout/EmailSettingsDialog.tsx src/components/layout/EmailSettingsDialog.test.tsx
git commit -m "feat: add per-user email settings dialog and its API client functions"
```

---

### Task 6: Wire `EmailSettingsDialog` into the app shell and nav

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `EmailSettingsDialog` (default export) from `src/components/layout/EmailSettingsDialog.tsx` (Task 5).
- Produces: nothing consumed by a later task — this is the last task in the plan.

- [ ] **Step 1: Add state and wiring to `AppShell.tsx`**

Open `src/components/layout/AppShell.tsx`. Add the import:

```tsx
import EmailSettingsDialog from './EmailSettingsDialog'
```

Add state, alongside the existing `isManagerViewOpen`:

```tsx
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false)
```

Find:

```tsx
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        hiddenTabIds={hiddenTabIds}
        onOpenManagerView={() => setIsManagerViewOpen(true)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          hiddenTabIds={hiddenTabIds}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenManagerView={() => setIsManagerViewOpen(true)}
        />
```

Replace with:

```tsx
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        hiddenTabIds={hiddenTabIds}
        onOpenManagerView={() => setIsManagerViewOpen(true)}
        onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          hiddenTabIds={hiddenTabIds}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenManagerView={() => setIsManagerViewOpen(true)}
          onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
        />
```

Find:

```tsx
      <ManagerViewDialog
        isOpen={isManagerViewOpen}
        onClose={() => setIsManagerViewOpen(false)}
        onHiddenTabsSaved={onHiddenTabsSaved}
      />
    </div>
  )
}
```

Replace with:

```tsx
      <ManagerViewDialog
        isOpen={isManagerViewOpen}
        onClose={() => setIsManagerViewOpen(false)}
        onHiddenTabsSaved={onHiddenTabsSaved}
      />
      <EmailSettingsDialog
        isOpen={isEmailSettingsOpen}
        onClose={() => setIsEmailSettingsOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add the dropdown item to `Sidebar.tsx`**

Open `src/components/layout/Sidebar.tsx`. Add `Mail` to the existing lucide-react import line:

```tsx
import { Building2, ChevronDown, FileText, LogOut, Mail, Settings, Upload, Users } from 'lucide-react'
```

Find:

```tsx
interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onOpenManagerView: () => void
}

export function Sidebar({ activeTab, onTabChange, hiddenTabIds, onOpenManagerView }: SidebarProps) {
```

Replace with:

```tsx
interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onOpenManagerView: () => void
  onOpenEmailSettings: () => void
}

export function Sidebar({ activeTab, onTabChange, hiddenTabIds, onOpenManagerView, onOpenEmailSettings }: SidebarProps) {
```

Find the existing dropdown items:

```tsx
              <DropdownMenuItem onClick={() => onTabChange('upload')}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTabChange('files')}>
                <FileText className="h-4 w-4 mr-2" />
                Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
```

Insert a new item between "Files" and "Logout":

```tsx
              <DropdownMenuItem onClick={() => onTabChange('upload')}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTabChange('files')}>
                <FileText className="h-4 w-4 mr-2" />
                Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenEmailSettings}>
                <Mail className="h-4 w-4 mr-2" />
                Email Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
```

- [ ] **Step 3: Add the matching button to `TopBar.tsx`**

Open `src/components/layout/TopBar.tsx`. Add `Mail` to the existing lucide-react import line:

```tsx
import { Bell, FileText, LogOut, Mail, Menu, RefreshCw, Search, Settings, Upload, Users, X } from 'lucide-react'
```

Find:

```tsx
interface TopBarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onRefresh: () => void
  isRefreshing: boolean
  onOpenSearch: () => void
  onOpenManagerView: () => void
}

export function TopBar({ activeTab, onTabChange, hiddenTabIds, onRefresh, isRefreshing, onOpenSearch, onOpenManagerView }: TopBarProps) {
```

Replace with:

```tsx
interface TopBarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onRefresh: () => void
  isRefreshing: boolean
  onOpenSearch: () => void
  onOpenManagerView: () => void
  onOpenEmailSettings: () => void
}

export function TopBar({ activeTab, onTabChange, hiddenTabIds, onRefresh, isRefreshing, onOpenSearch, onOpenManagerView, onOpenEmailSettings }: TopBarProps) {
```

Find the existing mobile-menu "Files" button:

```tsx
                <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('files') }}>
                  <FileText className="h-5 w-5 mr-3" />
                  Files
                </Button>
```

Insert a new button immediately after it (before the `{isAdmin && (...)}` Team block that follows):

```tsx
                <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onOpenEmailSettings() }}>
                  <Mail className="h-5 w-5 mr-3" />
                  Email Settings
                </Button>
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no regressions (existing `Sidebar.test.tsx`/`TopBar.test.tsx`, if present, still pass since the new prop is required but every real render site — `AppShell.tsx` — now provides it).

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: succeeds with zero errors — this is the final task, so this is also the whole plan's final build-green check.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/Sidebar.tsx src/components/layout/TopBar.tsx
git commit -m "feat: wire Email Settings into the account menu on desktop and mobile"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** Part 1 (SMTP active, Brevo deactivated) → Task 1. Part 2 (outbox table, idempotency, auth.js wiring) → Tasks 2-3. Part 3 (per-user SMTP: schema, routes, frontend, wiring) → Tasks 4-6.
- **Sequencing:** Task 2 and Task 4 both depend only on Task 1 (not on each other) — Task 4 could technically run before Task 2/3, but this plan orders them 1→2→3→4→5→6 for simplicity, matching the spec's own part ordering. Task 3 depends on Task 2. Task 5 depends on Task 4's exact response shapes. Task 6 depends on Task 5's component.
- **Type consistency check:** `sendOnce`'s parameter names (`templateKey`, `dedupeKey`, `to`, `subject`, `text`, `db`, `send`) are used identically in Task 2's implementation and Task 3's two call sites. `EmailSettings`'s shape (`{ configured, smtpUsername }`) matches exactly between Task 4's `GET /settings` response and Task 5's `getMyEmailSettings()` return type and the dialog's own state. `onOpenEmailSettings` is spelled identically across Task 6's `AppShell.tsx`, `Sidebar.tsx`, and `TopBar.tsx` changes.
- **Prisma compound-key name:** flagged explicitly in Task 2 Step 2 as something to verify against the actual generated client rather than assume — `templateKey_dedupeKey` is Prisma's standard default naming for `@@unique([templateKey, dedupeKey])`, but the step tells the implementer exactly how to confirm it and what to do if it's different.
- **No test added for Task 1** (`emailService.js`) or **Task 4's routes** (`email.js`) — both are deliberate, matching this repo's established convention that route/network-I/O code isn't unit-tested; Task 2's `emailOutbox.js` and Task 5's `EmailSettingsDialog.tsx` are the two places genuinely new logic exists that's worth testing directly, and both get real test files.
