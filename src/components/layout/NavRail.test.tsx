import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavRail } from './NavRail';
import { tabs, getVisibleTabs } from './navItems';

describe('NavRail', () => {
  it('renders every tab when nothing is hidden', () => {
    render(<NavRail activeTab="properties" onTabChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Eviction List/ })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(tabs.length);
  });

  it('hides tabs named in hiddenTabIds', () => {
    render(
      <NavRail activeTab="properties" onTabChange={() => {}} hiddenTabIds={new Set(['dashboard'])} />
    );
    expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(getVisibleTabs(new Set(['dashboard'])).length);
  });

  it('marks only the active tab with aria-current', () => {
    render(<NavRail activeTab="properties" onTabChange={() => {}} />);
    const current = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-current') === 'page'
    );
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Properties');
  });

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    render(<NavRail activeTab="dashboard" onTabChange={onTabChange} />);
    screen.getByRole('button', { name: 'Calendar' }).click();
    expect(onTabChange).toHaveBeenCalledWith('calendar');
  });

  it('renders the Public Website link by default, opening in a new tab', () => {
    render(<NavRail activeTab="properties" onTabChange={() => {}} />);
    const link = screen.getByRole('link', { name: /Public Website/ });
    expect(link).toBeTruthy();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('hides the Public Website link when publicSite is in hiddenTabIds', () => {
    render(
      <NavRail activeTab="properties" onTabChange={() => {}} hiddenTabIds={new Set(['publicSite'])} />
    );
    expect(screen.queryByRole('link', { name: /Public Website/ })).toBeNull();
  });
});
