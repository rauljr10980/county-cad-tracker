import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadsTable } from './LeadsTable';
import type { Lead, Task } from '@/crm/data/types';

const baseLead: Lead = {
  id: 'l1',
  businessName: 'Acme Realty',
  ownerName: 'Jane Doe',
  city: 'San Antonio',
  kind: 'industry',
  lastContactedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as Lead;

const noop = () => {};

describe('LeadsTable status badge', () => {
  it('shows Active for a lead contacted within the last 90 days', () => {
    const recentlyContacted: Lead = { ...baseLead, lastContactedAt: new Date().toISOString() };
    render(<LeadsTable leads={[recentlyContacted]} tasks={[]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows Inactive for a lead never contacted', () => {
    render(<LeadsTable leads={[baseLead]} tasks={[]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows Inactive for a lead last contacted over 90 days ago', () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 120);
    const stale: Lead = { ...baseLead, lastContactedAt: staleDate.toISOString() };
    render(<LeadsTable leads={[stale]} tasks={[]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows Active for a lead last contacted exactly 90 days ago', () => {
    vi.useFakeTimers();
    try {
      const fixedNow = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(fixedNow);
      const boundary = new Date(fixedNow.getTime() - 90 * 24 * 60 * 60 * 1000);
      const exactEdge: Lead = { ...baseLead, lastContactedAt: boundary.toISOString() };
      render(<LeadsTable leads={[exactEdge]} tasks={[]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
      expect(screen.getByText('Active')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LeadsTable columns', () => {
  it('shows the contact name and an initials avatar, and falls back to businessName for Company', () => {
    render(<LeadsTable leads={[baseLead]} tasks={[]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('JD')).toBeTruthy(); // AvatarInitials from "Jane Doe"
    expect(screen.getByText('Acme Realty')).toBeTruthy(); // Company, via businessName fallback
  });

  it('shows the nearest incomplete task as Next Follow Up, ignoring completed ones and later ones', () => {
    // Noon UTC, not midnight — keeps the rendered local date stable no
    // matter which timezone this suite runs in.
    const tasks: Task[] = [
      { id: 't1', leadId: 'l1', type: 'Call', dueAt: '2026-03-01T12:00:00.000Z', completed: true, completedAt: '2026-03-01T12:00:00.000Z', notes: '' },
      { id: 't2', leadId: 'l1', type: 'Email', dueAt: '2026-05-01T12:00:00.000Z', completed: false, completedAt: null, notes: '' },
      { id: 't3', leadId: 'l1', type: 'Meeting', dueAt: '2026-04-01T12:00:00.000Z', completed: false, completedAt: null, notes: '' },
      { id: 't4', leadId: 'other-lead', type: 'Call', dueAt: '2026-01-15T12:00:00.000Z', completed: false, completedAt: null, notes: '' },
    ];
    render(<LeadsTable leads={[baseLead]} tasks={tasks} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Apr 1, 2026')).toBeTruthy();
  });

  it('shows a dash for Next Follow Up when there is no incomplete task', () => {
    render(<LeadsTable leads={[baseLead]} tasks={[]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('opens a kebab menu with rating options and Schedule a meeting, without navigating the row', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRateConnection = vi.fn();
    const onScheduleMeeting = vi.fn();
    render(<LeadsTable leads={[baseLead]} tasks={[]} onRowClick={onRowClick} onRateConnection={onRateConnection} onScheduleMeeting={onScheduleMeeting} />);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const scheduleItem = await screen.findByText('Schedule a meeting');
    expect(onRowClick).not.toHaveBeenCalled();

    await user.click(scheduleItem);
    expect(onScheduleMeeting).toHaveBeenCalledWith('l1');
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
