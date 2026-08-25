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
  it('renders every queue as a tab, in QUEUES order', () => {
    render(<QueueTabs active="all" counts={counts} onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(QUEUES.length);
    tabs.forEach((tab, i) => {
      expect(tab.textContent).toContain(QUEUES[i].label);
    });
  });

  it('marks only the active tab with aria-selected=true', () => {
    render(<QueueTabs active="overdue" counts={counts} onChange={() => {}} />);
    const selected = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Overdue');
  });

  it('calls onChange with the clicked queue id', () => {
    const onChange = vi.fn();
    render(<QueueTabs active="all" counts={counts} onChange={onChange} />);
    screen.getByRole('tab', { name: /Parked/ }).click();
    expect(onChange).toHaveBeenCalledWith('parked');
  });

  it('renders each queue count, formatted with toLocaleString', () => {
    const bigCounts: PipelineCounts = { ...counts, all: 12345 };
    render(<QueueTabs active="all" counts={bigCounts} onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /All/ }).textContent).toContain('12,345');
  });

  it('gives the overdue tab the destructive treatment only when inactive with a nonzero count', () => {
    render(<QueueTabs active="all" counts={counts} onChange={() => {}} />);
    const overdueTab = screen.getByRole('tab', { name: /Overdue/ });
    expect(overdueTab.className).toContain('text-destructive');
  });

  it('does not mark overdue as destructive when its count is zero', () => {
    const zeroOverdue: PipelineCounts = { ...counts, overdue: 0 };
    render(<QueueTabs active="all" counts={zeroOverdue} onChange={() => {}} />);
    const overdueTab = screen.getByRole('tab', { name: /Overdue/ });
    expect(overdueTab.className).not.toContain('text-destructive');
  });

  it('does not mark overdue as destructive when overdue is the active tab', () => {
    render(<QueueTabs active="overdue" counts={counts} onChange={() => {}} />);
    const overdueTab = screen.getByRole('tab', { name: /Overdue/ });
    expect(overdueTab.className).not.toContain('text-destructive');
  });

  it('renders without counts (null) and omits count spans', () => {
    render(<QueueTabs active="all" counts={null} onChange={() => {}} />);
    const allTab = screen.getByRole('tab', { name: /All/ });
    expect(allTab.querySelector('.record')).toBeNull();
  });
});
