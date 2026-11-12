import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ManagerViewDialog } from './ManagerViewDialog';
import { getTabAssignments, saveTabAssignments, getHiddenTabs } from '@/lib/api';
vi.mock('@/lib/api', () => ({ getTabAssignments: vi.fn(), saveTabAssignments: vi.fn(), getHiddenTabs: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTabAssignments).mockResolvedValue({ hiddenTabs: ['mls'], tabMembers: { mls: ['test'] }, users: [{ id: 'raul', username: 'Raul', role: 'OPERATOR' }, { id: 'test', username: 'test', role: 'ADMIN' }] });
  vi.mocked(saveTabAssignments).mockResolvedValue(undefined);
  vi.mocked(getHiddenTabs).mockResolvedValue(['mls']);
});
describe('Manager Settings subscriptions', () => {
  it('lets the manager replace test with Raul for MLS while keeping other tab assignments', async () => {
    const saved = vi.fn(), close = vi.fn();
    render(<ManagerViewDialog isOpen onClose={close} onHiddenTabsSaved={saved} />);
    await screen.findByText('Custom MLS Leads');
    fireEvent.click(screen.getByText('Custom MLS Leads').closest('summary')!);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Custom MLS Leads: Raul' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Custom MLS Leads: test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(saveTabAssignments).toHaveBeenCalledWith(expect.objectContaining({ mls: ['raul'], calendar: ['raul', 'test'] }));
    expect(saved).toHaveBeenCalledWith(new Set(['mls']));
  });
  it('keeps the selection open and reports a failed save', async () => {
    vi.mocked(saveTabAssignments).mockRejectedValue(new Error('Could not save assignments.'));
    const close = vi.fn();
    render(<ManagerViewDialog isOpen onClose={close} onHiddenTabsSaved={() => {}} />);
    await screen.findByText('Custom MLS Leads');
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save assignments.');
    expect(close).not.toHaveBeenCalled();
  });
});
