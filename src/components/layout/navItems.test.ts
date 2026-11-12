import { describe, expect, it } from 'vitest';
import { canAccessMls, getVisibleTabs } from './navItems';

describe('account-specific MLS availability', () => {
  it('shows MLS for test even when hidden by the team settings, preserving other hidden tabs', () => {
    const ids = getVisibleTabs(new Set(['mls', 'properties']), { username: 'test' }).map(tab => tab.id);
    expect(ids).toContain('mls');
    expect(ids).not.toContain('properties');
  });
  it.each([null, { username: 'admin' }, { username: 'other' }])('keeps MLS unavailable to another account', user => {
    expect(canAccessMls(user)).toBe(false);
    expect(getVisibleTabs(new Set(), user).some(tab => tab.id === 'mls')).toBe(false);
  });
});
