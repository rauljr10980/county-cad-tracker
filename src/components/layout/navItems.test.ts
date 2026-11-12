import { describe, expect, it } from 'vitest';
import { getVisibleTabs } from './navItems';

describe('resolved per-member tab availability', () => {
  it('shows assigned MLS and keeps unsubscribed properties hidden', () => {
    const ids = getVisibleTabs(new Set(['properties'])).map(tab => tab.id);
    expect(ids).toContain('mls');
    expect(ids).not.toContain('properties');
  });
  it.each([null, { username: 'test' }, { username: 'raul' }])('does not bypass subscriptions based on username', user => {
    expect(getVisibleTabs(new Set(['mls']), user).some(tab => tab.id === 'mls')).toBe(false);
  });
});
