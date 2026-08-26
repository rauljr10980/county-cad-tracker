import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueTabs } from './QueueTabs';
import { QUEUES } from './queues';
import type { PipelineCounts } from '../types/crm';

const counts: PipelineCounts = {
  all: 120,
  needsContact: 15,
  overdue: 4,
  dueToday: 2,
  upcoming: 30,
  parked: 5,
  closed: 64,
};

describe('QueueTabs', () => {
  it('renders every queue as a plain button, in QUEUES order', () => {
    render(<QueueTabs active="all" counts={counts} onChange={() => {}} />);
    const tabs = screen.getAllByRole('button');
    expect(tabs).toHaveLength(QUEUES.length);
    tabs.forEach((tab, i) => {
      expect(tab.textContent).toContain(QUEUES[i].label);
    });
  });

  // No role="tablist"/role="tab" here: that ARIA pattern promises arrow-key
  // navigation between tabs, which this component does not implement.
  // aria-current is the non-visual signal instead, matching CrmSidebar.
  it('marks only the active tab with aria-current="page"', () => {
    render(<QueueTabs active="overdue" counts={counts} onChange={() => {}} />);
    const current = screen.getAllByRole('button').filter((t) => t.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Overdue');
  });

  it('does not set aria-current on inactive tabs', () => {
    render(<QueueTabs active="overdue" counts={counts} onChange={() => {}} />);
    const inactive = screen.getByRole('button', { name: /All/ });
    expect(inactive.getAttribute('aria-current')).toBeNull();
  });

  it('does not use tablist/tab roles or aria-selected', () => {
    render(<QueueTabs active="all" counts={counts} onChange={() => {}} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    screen.getAllByRole('button').forEach((tab) => {
      expect(tab.hasAttribute('aria-selected')).toBe(false);
    });
  });

  it('calls onChange with the clicked queue id', () => {
    const onChange = vi.fn();
    render(<QueueTabs active="all" counts={counts} onChange={onChange} />);
    screen.getByRole('button', { name: /Parked/ }).click();
    expect(onChange).toHaveBeenCalledWith('parked');
  });

  it('renders each queue count, formatted with toLocaleString', () => {
    const bigCounts: PipelineCounts = { ...counts, all: 12345 };
    render(<QueueTabs active="all" counts={bigCounts} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /All/ }).textContent).toContain('12,345');
  });

  it('gives the overdue tab the destructive treatment only when inactive with a nonzero count', () => {
    render(<QueueTabs active="all" counts={counts} onChange={() => {}} />);
    const overdueTab = screen.getByRole('button', { name: /Overdue/ });
    expect(overdueTab.className).toContain('text-destructive');
  });

  it('does not mark overdue as destructive when its count is zero', () => {
    const zeroOverdue: PipelineCounts = { ...counts, overdue: 0 };
    render(<QueueTabs active="all" counts={zeroOverdue} onChange={() => {}} />);
    const overdueTab = screen.getByRole('button', { name: /Overdue/ });
    expect(overdueTab.className).not.toContain('text-destructive');
  });

  it('does not mark overdue as destructive when overdue is the active tab', () => {
    render(<QueueTabs active="overdue" counts={counts} onChange={() => {}} />);
    const overdueTab = screen.getByRole('button', { name: /Overdue/ });
    expect(overdueTab.className).not.toContain('text-destructive');
  });

  it('renders without counts (null) and omits count spans', () => {
    render(<QueueTabs active="all" counts={null} onChange={() => {}} />);
    const allTab = screen.getByRole('button', { name: /All/ });
    expect(allTab.querySelector('.record')).toBeNull();
  });
});
