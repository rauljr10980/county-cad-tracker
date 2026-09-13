import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from './Dashboard';

// jsdom has no ResizeObserver; recharts' ResponsiveContainer (used by the
// pre-existing, unchanged Team Activity charts further down Dashboard.tsx)
// uses one internally and throws without this stub. Not a concern of the
// greeting/KPI row this test targets — same fix as GlobalSearchDialog.test.tsx.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? ResizeObserverStub

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'Raul' } }),
}));

vi.mock('@/hooks/useFiles', () => ({
  useDashboardStats: () => ({
    data: {
      totalProperties: 111,
      byStatus: { judgment: 0, active: 0, pending: 0 },
      totalAmountDue: 0,
      avgAmountDue: 0,
      newThisMonth: 0,
      removedThisMonth: 0,
      deadLeads: 0,
      pipeline: { totalValue: 12400000, activeDeals: 8, byStage: {}, conversionRate: 0, avgDealValue: 0 },
    },
    isLoading: false,
    error: null,
  }),
  useCallStats: () => ({ data: { daily: 0, weekly: 0, monthly: 0 } }),
  useCallActivity: () => ({ data: [] }),
  useTeamStats: () => ({ data: [] }),
}));

vi.mock('@/hooks/usePreForeclosure', () => ({
  usePreForeclosures: () => ({ data: Array.from({ length: 111 }, (_, i) => ({ id: String(i) })) }),
}));

vi.mock('@/hooks/useLeadCounts', () => ({
  useEvictionLeadsCount: () => ({ data: 3139 }),
  useMlsLeadsCount: () => ({ data: 2321 }),
}));

vi.mock('@/hooks/useFollowUps', () => ({
  useFollowUps: () => ({ data: [] }),
}));

vi.mock('@/hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => [],
}));

vi.mock('@/crm/store/useCrmStore', () => ({
  useCrmStore: (selector: (s: any) => unknown) =>
    selector({ leads: [{ id: 'l1', kind: 'industry' }, { id: 'l2', kind: 'retail' }], activities: [] }),
}));

describe('Dashboard KPI row', () => {
  it('greets the signed-in user by name', () => {
    render(<Dashboard />);
    // Scoped to the greeting heading: the pre-existing (unchanged) Team
    // Activity legend also renders "Raul" from its MOCK_TEAM fallback data,
    // so an unscoped text match would find more than one element.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Raul/);
  });

  it('renders all 8 KPI cards with their counts', () => {
    render(<Dashboard />);
    expect(screen.getByText('Eviction Leads')).toBeTruthy();
    expect(screen.getByText('3,139')).toBeTruthy();
    expect(screen.getByText('Pre-Foreclosures')).toBeTruthy();
    expect(screen.getByText('111')).toBeTruthy();
    expect(screen.getByText('MLS Leads')).toBeTruthy();
    expect(screen.getByText('2,321')).toBeTruthy();
    expect(screen.getByText('Key Relationships')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // one 'industry' lead in the mock
    expect(screen.getByText('Deals in Pipeline')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('Est. Acquisition Value')).toBeTruthy();
    expect(screen.getByText('$12,400,000')).toBeTruthy();
  });
});
