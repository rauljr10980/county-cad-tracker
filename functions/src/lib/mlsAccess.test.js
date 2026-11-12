import { describe, expect, it, vi } from 'vitest';
import { requireMlsAccess } from './mlsAccess.js';

describe('MLS pilot access', () => {
  it('allows the authenticated test account', () => {
    const next = vi.fn();
    requireMlsAccess({ user: { username: 'test', role: 'ADMIN' } }, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });
  it.each([undefined, { username: 'admin', role: 'ADMIN' }, { username: 'teammate', role: 'OPERATOR' }])('denies other accounts regardless of role or a spoofed view-as header', (user) => {
    const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requireMlsAccess({ user, headers: { 'x-view-as-user': 'test' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
