import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavRail } from './NavRail';

describe('NavRail', () => {
  it('renders every visible tab', () => {
    render(<NavRail activeTab="dashboard" onTabChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Dashboard/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Eviction List/ })).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(8);
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
    screen.getByRole('button', { name: /Calendar/ }).click();
    expect(onTabChange).toHaveBeenCalledWith('calendar');
  });
});
