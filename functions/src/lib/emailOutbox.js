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
