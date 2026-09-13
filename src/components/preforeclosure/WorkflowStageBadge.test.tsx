import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkflowStageBadge } from './WorkflowStageBadge';

describe('WorkflowStageBadge stage colors', () => {
  it('shows a fresh lead as blue', () => {
    render(<WorkflowStageBadge stage="not_started" />);
    expect(screen.getByText('Not Started').className).toContain('text-blue-400');
  });

  it('shows early-discovery stages as purple', () => {
    const shortLabels: Record<string, string> = {
      initial_visit: 'Visit',
      waiting_to_be_contacted: 'Waiting',
      people_search: 'Search',
      land_records: 'Records',
    };
    for (const [stage, shortLabel] of Object.entries(shortLabels)) {
      const { unmount } = render(<WorkflowStageBadge stage={stage as never} />);
      expect(screen.getByText(shortLabel).className).toContain('text-purple-400');
      unmount();
    }
  });

  it('shows active-engagement stages as amber', () => {
    const shortLabels: Record<string, string> = {
      call_owner: 'Call',
      visit_heirs: 'Visit Heirs',
      call_heirs: 'Call Heirs',
      negotiating: 'Negotiate',
      comps: 'Comps',
    };
    for (const [stage, shortLabel] of Object.entries(shortLabels)) {
      const { unmount } = render(<WorkflowStageBadge stage={stage as never} />);
      expect(screen.getByText(shortLabel).className).toContain('text-amber-300');
      unmount();
    }
  });

  it('keeps a sent offer green', () => {
    render(<WorkflowStageBadge stage="sent_offer" />);
    expect(screen.getByText('Offer').className).toContain('text-green-400');
  });

  it('keeps a dead deal red', () => {
    render(<WorkflowStageBadge stage="dead_end" />);
    expect(screen.getByText('Dead End').className).toContain('text-red-400');
  });

  it('still shows Underwater in blue regardless of stage', () => {
    render(<WorkflowStageBadge stage="sent_offer" isUnderwater />);
    expect(screen.getByText('Underwater').className).toContain('text-blue-400');
  });
});
