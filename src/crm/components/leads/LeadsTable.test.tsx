import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadsTable } from './LeadsTable';
import type { Lead } from '@/crm/data/types';

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
    render(<LeadsTable leads={[recentlyContacted]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows Inactive for a lead never contacted', () => {
    render(<LeadsTable leads={[baseLead]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows Inactive for a lead last contacted over 90 days ago', () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 120);
    const stale: Lead = { ...baseLead, lastContactedAt: staleDate.toISOString() };
    render(<LeadsTable leads={[stale]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows Active for a lead last contacted exactly 90 days ago', () => {
    vi.useFakeTimers();
    try {
      const fixedNow = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(fixedNow);
      const boundary = new Date(fixedNow.getTime() - 90 * 24 * 60 * 60 * 1000);
      const exactEdge: Lead = { ...baseLead, lastContactedAt: boundary.toISOString() };
      render(<LeadsTable leads={[exactEdge]} onRowClick={noop} onRateConnection={noop} onScheduleMeeting={noop} />);
      expect(screen.getByText('Active')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
