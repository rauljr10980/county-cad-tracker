/**
 * Pure logic for the public lead-intake endpoint: the sourcePage allow-list,
 * the honeypot decision, the "email or phone required" rule, and salted IP
 * hashing.
 *
 * Pure and dependency-free (no Prisma, no `req`/`res`) so it can be unit
 * tested directly — see `publicIntake.test.js` — without needing a database.
 * `functions/src/lib/pipelineQueues.js` is the precedent for this pattern.
 * `functions/src/routes/publicIntake.js` is the only caller.
 */

const crypto = require('crypto');

// The four funnel pages on the public marketing site
// (rauljr10980/estate-essentials-co) that POST here. `sourcePage` is the
// Inbox's most important signal — someone from distressed-property is a
// different conversation than someone from landlord-help — so anything
// outside this list is rejected rather than stored as an arbitrary string.
const SOURCE_PAGES = ['sell-property', 'distressed-property', 'inherited-property', 'landlord-help'];

const isValidSourcePage = (sourcePage) => SOURCE_PAGES.includes(String(sourcePage ?? ''));

// A real form leaves `website` empty and CSS-hides it; only a bot fills it
// in. Trimmed first so whitespace-only garbage still counts as "filled in".
const isHoneypotTriggered = (website) => String(website ?? '').trim().length > 0;

// A submission with neither is not a lead — there is no way to reply to it.
const hasContactMethod = ({ email, phone } = {}) =>
  Boolean(String(email ?? '').trim()) || Boolean(String(phone ?? '').trim());

// Used only if IP_HASH_SALT is unset. Not a secret worth protecting in this
// file — the whole point of a configured salt is that it's NOT this
// constant — but it keeps hashing deterministic (and non-identifying) even
// before Railway variables are configured.
const DEFAULT_IP_HASH_SALT = 'county-cad-tracker-ip-hash-fallback-salt-2026';

let warnedMissingSalt = false;

// Reads the salt lazily (not at module load) so tests can toggle
// process.env.IP_HASH_SALT between cases.
function getIpHashSalt() {
  if (process.env.IP_HASH_SALT) return process.env.IP_HASH_SALT;
  if (!warnedMissingSalt) {
    console.warn(
      '[publicIntake] IP_HASH_SALT is not set — falling back to a constant salt. ' +
      'Set IP_HASH_SALT in Railway variables so stored ipHash values cannot be ' +
      'rainbow-tabled by anyone who can read this source.'
    );
    warnedMissingSalt = true;
  }
  return DEFAULT_IP_HASH_SALT;
}

// Salted, one-way (SHA-256). Enough to rate-limit and spot a flood from the
// same visitor without keeping identifiable data (the raw IP) about someone
// who filled in a form and may never become a customer. The raw `ip` never
// appears in the return value.
function hashIp(ip, salt = getIpHashSalt()) {
  return crypto.createHash('sha256').update(`${salt}:${String(ip ?? '')}`).digest('hex');
}

module.exports = {
  SOURCE_PAGES,
  isValidSourcePage,
  isHoneypotTriggered,
  hasContactMethod,
  hashIp,
  getIpHashSalt,
  DEFAULT_IP_HASH_SALT,
};
