import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineTable } from './PipelineTable';
import type { Lead } from '../types/crm';
import { lastContactLabel, followUpLabel } from './queues';

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

  // A mutation test (swapping filingCount/addressCount in the JSX) showed that
  // page-wide getByText lookups and class-only indexed checks can't tell two
  // numeric columns apart — the swap slid right through. This test pins each
  // column's rendered text to its exact <td> index instead, with Filings and
  // Doors deliberately given distinct values so a swap of the two fails here.
  it('pins each field to its own column position, so swapped columns fail', () => {
    const lastContactedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const nextFollowUpAt = new Date(Date.now() + 12 * 86_400_000).toISOString();
    const lead = makeLead({
      name: 'Acme Holdings',
      filingCount: 3,
      addressCount: 11, // deliberately different from filingCount
      contactStage: 'Contacted',
      lastContactedAt,
      nextFollowUpAt,
      assignedTo: { id: 'u1', username: 'jdoe' },
    });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={() => {}} />);
    const row = screen.getByText('Acme Holdings').closest('tr');
    expect(row).not.toBeNull();
    const cells = row ? Array.from(row.querySelectorAll('td')) : [];
    // Columns: Owner, Filings, Doors, Stage, Last contact, Next follow-up, Assigned, Action
    expect(cells[0].textContent).toBe('Acme Holdings');
    expect(cells[1].textContent).toBe('3'); // Filings
    expect(cells[2].textContent).toBe('11'); // Doors
    expect(cells[3].textContent).toBe('Contacted');
    expect(cells[4].textContent).toBe(lastContactLabel(lastContactedAt)); // Last contact ("Nd ago")
    expect(cells[5].textContent).toBe(followUpLabel(nextFollowUpAt)); // Next follow-up ("in Nd") — distinct shape from Last contact
    expect(cells[6].textContent).toBe('jdoe');
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

  it('exposes the row-open action as a keyboard-operable button with a lead-specific accessible name, firing onOpen exactly once', () => {
    const onOpen = vi.fn();
    const lead = makeLead({ id: 'lead-42', name: 'Acme Holdings' });
    render(<PipelineTable leads={[lead]} loading={false} onOpen={onOpen} />);
    const openButton = screen.getByRole('button', { name: 'Open Acme Holdings' });
    openButton.click();
    expect(onOpen).toHaveBeenCalledWith('lead-42');
    expect(onOpen).toHaveBeenCalledTimes(1); // the click must not also bubble into the row's onClick
  });

  it('gives each row a distinct accessible Open-button name, not seven identical "Open" buttons', () => {
    const leadA = makeLead({ id: 'lead-a', name: 'Acme Holdings' });
    const leadB = makeLead({ id: 'lead-b', name: 'Beta Properties' });
    render(<PipelineTable leads={[leadA, leadB]} loading={false} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open Acme Holdings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Beta Properties' })).toBeTruthy();
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
