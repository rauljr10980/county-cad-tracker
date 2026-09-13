import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { D4dKanbanBoard } from './D4dKanbanBoard';
import type { DrivingLead } from '@/types/property';

const mutate = vi.fn();
vi.mock('@/hooks/useDrivingLeads', () => ({
  useUpdateDrivingLead: () => ({ mutate }),
}));

const leads: DrivingLead[] = [
  { id: '1', rawAddress: '1 Main St', street: '1 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'NEW', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: '2', rawAddress: '2 Main St', street: '2 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'RESEARCHING', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: '3', rawAddress: '3 Main St', street: '3 Main St', city: 'San Antonio', state: 'TX', zip: '78201', status: 'DEAD', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

describe('D4dKanbanBoard', () => {
  it('renders all 6 stage columns', () => {
    render(<D4dKanbanBoard leads={leads} />);
    expect(screen.getByText('Leads')).toBeTruthy();
    expect(screen.getByText('Researching')).toBeTruthy();
    expect(screen.getByText('Found Obituary')).toBeTruthy();
    expect(screen.getByText('Contacted')).toBeTruthy();
    expect(screen.getByText('Under Contract')).toBeTruthy();
    expect(screen.getByText('Dead Deal')).toBeTruthy();
  });

  it('places each lead card under its own stage column', () => {
    render(<D4dKanbanBoard leads={leads} />);
    expect(screen.getByText('1 Main St')).toBeTruthy();
    expect(screen.getByText('2 Main St')).toBeTruthy();
    expect(screen.getByText('3 Main St')).toBeTruthy();
  });

  it('shows an empty-state message for a stage with no leads', () => {
    render(<D4dKanbanBoard leads={[leads[0]]} />);
    expect(screen.getAllByText(/no leads/i).length).toBeGreaterThan(0);
  });
});
