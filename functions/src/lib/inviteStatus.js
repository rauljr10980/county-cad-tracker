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
