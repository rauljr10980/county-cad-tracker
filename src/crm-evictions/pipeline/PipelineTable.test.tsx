import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineTable } from './PipelineTable';
import type { Lead } from '../types/crm';

const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-1',
  name: 'Acme Holdings',
  isCorporate: true,
  contactStage: 'Contacted',
  serviceInterests: [],
  contacts: {},
  notes: '',
  filingCount: 3,
  addressCount: 7,
  ...overrides,
});

describe('PipelineTable', () => {
  it('renders the column headers in the exact required order', () => {
    render(<PipelineTable leads={[]} loading={false} onOpen={() => {}} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Owner', 'Filings', 'Doors', 'Stage', 'Last contact', 'Next follow-up', 'Assigned', '']);
  });

  it('shows a spinner while loading and no rows', () => {
    const { container } = render(<PipelineTable leads={[]} loading={true} onOpen={() => {}} />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryAllByRole('row')).toHaveLength(2); // header row + the loading row
  });

  it('shows the empty state when not loading and there are no leads', () => {
    render(<PipelineTable leads={[]} loading={false} onOpen={() => {}} />);
    expect(screen.getByText('Nothing in this queue.')).toBeTruthy();
  });

  it('renders lead fields into their matching columns', () => {
    const lead = makeLead({ assignedTo: { id: 'u1', username: 'jdoe' } });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={() => {}} />);
    expect(screen.getByText('Acme Holdings')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Contacted')).toBeTruthy();
    expect(screen.getByText('jdoe')).toBeTruthy();
  });

  it('renders "Never" for a lead with no last-contact date, not a dash', () => {
    const lead = makeLead({ lastContactedAt: undefined });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={() => {}} />);
    expect(screen.getByText('Never')).toBeTruthy();
  });

  it('renders an em dash for assigned when no assignee is set', () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const lead = makeLead({ assignedTo: null, nextFollowUpAt: inTenDays });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={() => {}} />);
    const row = screen.getByText('Acme Holdings').closest('tr');
    const assignedCell = row?.querySelectorAll('td')[6];
    expect(assignedCell?.textContent).toBe('—');
  });

  it('marks an overdue follow-up with the destructive tone', () => {
    const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const lead = makeLead({ nextFollowUpAt: yesterday });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={() => {}} />);
    const cell = screen.getByText(/overdue/);
    expect(cell.className).toContain('text-destructive');
  });

  it('calls onOpen with the lead id when its row is clicked', () => {
    const onOpen = vi.fn();
    const lead = makeLead({ id: 'lead-42' });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={onOpen} />);
    screen.getByText('Acme Holdings').closest('tr')?.click();
    expect(onOpen).toHaveBeenCalledWith('lead-42');
  });

  it('applies monospace record styling only to record-valued cells, never to the name, stage, or assigned columns', () => {
    const lead = makeLead({ assignedTo: { id: 'u1', username: 'jdoe' } });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={() => {}} />);
    const row = screen.getByText('Acme Holdings').closest('tr');
    expect(row).not.toBeNull();
    const cells = row ? Array.from(row.querySelectorAll('td')) : [];
    // Columns: Owner, Filings, Doors, Stage, Last contact, Next follow-up, Assigned, Action
    expect(cells[0].className).not.toContain('record'); // Owner (name)
    expect(cells[1].className).toContain('record'); // Filings
    expect(cells[2].className).toContain('record'); // Doors
    expect(cells[3].className).not.toContain('record'); // Stage (badge)
    expect(cells[4].className).toContain('record'); // Last contact
    expect(cells[5].className).toContain('record'); // Next follow-up
    expect(cells[6].className).not.toContain('record'); // Assigned (username)
  });
});
