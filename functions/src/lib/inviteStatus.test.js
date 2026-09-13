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
