import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { D4dKanbanCard } from './D4dKanbanCard';
import type { DrivingLead } from '@/types/property';

const lead: DrivingLead = {
  id: 'lead-1',
  rawAddress: '4239 Northington St, San Antonio, TX',
  street: '4239 Northington St',
  city: 'San Antonio',
  state: 'TX',
  zip: '78201',
  status: 'NEW',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('D4dKanbanCard', () => {
  it('shows the street address and city/state', () => {
    render(<D4dKanbanCard lead={lead} />);
    expect(screen.getByText('4239 Northington St')).toBeTruthy();
    expect(screen.getByText('San Antonio, TX')).toBeTruthy();
  });

  it('calls onViewDetails with the lead when the view button is clicked', () => {
    const onViewDetails = vi.fn();
    render(<D4dKanbanCard lead={lead} onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(onViewDetails).toHaveBeenCalledWith(lead);
  });

  it('renders no view button when onViewDetails is not passed', () => {
    render(<D4dKanbanCard lead={lead} />);
    expect(screen.queryByRole('button', { name: /view details/i })).toBeNull();
  });
});
