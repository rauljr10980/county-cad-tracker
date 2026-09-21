const prisma = require('../lib/prisma');
const { decideEffectiveUserId, FORBIDDEN_VIEW_AS_CODE } = require('../lib/viewAs');

/**
 * Resolves the account a request acts on. Runs AFTER authenticateToken.
 *
 * Routes opt in by reading req.effectiveUserId instead of req.user.id. Routes
 * that keep reading req.user.id are unaffected, which is what makes an
 * implicit header safe: nothing changes behavior unless it was deliberately
 * edited to.
 */
async function resolveViewAs(req, res, next) {
  try {
    const userId = decideEffectiveUserId(req.user, req.headers['x-view-as-user']);

    if (userId !== req.user.id) {
      const exists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) return res.status(404).json({ error: 'Team member not found' });
    }

    req.effectiveUserId = userId;
    next();
  } catch (err) {
    if (err.code === FORBIDDEN_VIEW_AS_CODE) {
      return res.status(403).json({ error: err.message });
    }
    console.error('[viewAs] resolve error:', err);
    return res.status(500).json({ error: 'Failed to resolve account' });
  }
}

module.exports = { resolveViewAs };
