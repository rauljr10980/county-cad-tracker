import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiTiles } from './KpiTiles';
import type { CrmStats } from '../types/crm';

// Values chosen so the Follow-ups sum (27) is unambiguous: no other tile in this
// fixture renders 27, and next7 alone (23) is also distinct from the sum, so a
// regression back to `next7` alone would fail this assertion instead of passing
// silently.
const stats: CrmStats = {
  total: 100,
  byStage: { 'New Lead': 10, Contacted: 15, 'Appointment Scheduled': 5 },
  byService: {},
  byAssignee: [],
  unassigned: 12,
  followUpsDue: { overdue: 2, today: 4, next7: 23 },
  activeOpportunities: 8,
  closedDeals: 3,
};

describe('KpiTiles', () => {
  it('renders the Follow-ups tile as today + next7, not next7 alone', () => {
    render(<KpiTiles stats={stats} />);

    const followUpsTile = screen.getByText('Follow-ups').closest('div');
    expect(followUpsTile).not.toBeNull();
    expect(followUpsTile?.textContent).toContain('27');

    // Confirms the fixture doesn't accidentally make "27" ambiguous across tiles,
    // which would make the assertion above prove nothing.
    expect(screen.getAllByText('27')).toHaveLength(1);
  });
});
