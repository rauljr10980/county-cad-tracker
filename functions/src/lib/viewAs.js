/**
 * The rule for which account a request acts on.
 *
 * Dependency-free on purpose, exactly like crmScope.js: middleware/viewAs.js
 * constructs Prisma at require time and so cannot be imported under vitest.
 * Keeping the decision here is what makes it testable; the caller performs the
 * database existence check, which is the one part that needs I/O.
 */

const FORBIDDEN_VIEW_AS_CODE = 'FORBIDDEN_VIEW_AS';

/**
 * Returns the id of the account this request should act on.
 *
 * A caller always acts as themselves unless they explicitly ask for another
 * account via the X-View-As-User header (set by the global "viewing as"
 * switch — see src/lib/api.ts), which only an ADMIN may do.
 *
 * Whether the requested account exists is a database question the caller
 * answers separately.
 */
const decideEffectiveUserId = (user, rawHeader) => {
  const target = typeof rawHeader === 'string' ? rawHeader : undefined;
  if (!target || target === user.id) return user.id;

  if (user.role !== 'ADMIN') {
    const err = new Error("Only a Manager can view another account's data");
    err.code = FORBIDDEN_VIEW_AS_CODE;
    throw err;
  }

  return target;
};

module.exports = { decideEffectiveUserId, FORBIDDEN_VIEW_AS_CODE };
