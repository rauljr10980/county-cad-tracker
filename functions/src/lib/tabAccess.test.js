import { describe, expect, it, vi } from 'vitest';
import { TAB_IDS, hiddenTabsFor, requireTabAccess, validateTabMembers } from './tabAccess.js';

const settings = { hiddenTabs: ['mls', 'properties'], tabMembers: { mls: ['raul'], calendar: [] } };
describe('team tab subscriptions', () => {
  it('allows a selected member and unsubscribes every other member, including managers', () => {
    expect(hiddenTabsFor(settings, 'raul')).not.toContain('mls');
    expect(hiddenTabsFor(settings, 'test')).toContain('mls');
    expect(hiddenTabsFor(settings, 'new-member')).toContain('mls');
    expect(hiddenTabsFor(settings, 'raul')).toContain('calendar');
    expect(hiddenTabsFor(settings, 'raul')).toContain('properties');
  });
  it('validates every tab and rejects unknown users, duplicate members and unknown tabs', () => {
    const valid = Object.fromEntries(TAB_IDS.map(tab => [tab, ['raul']]));
    expect(validateTabMembers(valid, [{ id: 'raul' }])).toEqual(valid);
    for (const invalid of [{}, { ...valid, mls: ['stranger'] }, { ...valid, mls: ['raul', 'raul'] }, { ...valid, fake: [] }]) expect(() => validateTabMembers(invalid, [{ id: 'raul' }])).toThrow();
  });
  it('enforces saved subscriptions at the API, with no administrator or username bypass', async () => {
    const db = { appSetting: { findMany: vi.fn().mockResolvedValue(Object.entries(settings).map(([key, value]) => ({ key: key === 'tabMembers' ? 'tabMembers' : 'hiddenTabs', value: JSON.stringify(value) }))) } };
    const gate = requireTabAccess('mls', db);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
    await gate({ user: { id: 'test', username: 'test', role: 'ADMIN' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    await gate({ user: { id: 'raul', role: 'OPERATOR' } }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
