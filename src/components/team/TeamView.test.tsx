import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamView from './TeamView';

// jsdom has no hasPointerCapture/scrollIntoView, which Radix's Select
// (the new role dropdown below) calls internally when it opens/closes.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', username: 'raul', role: 'ADMIN' } }),
}));

const mockInvites = vi.fn();
const mockUsers = vi.fn();
const mockCreateInvite = vi.fn();
const mockRevokeInvite = vi.fn();
const mockSetUserActive = vi.fn();
const mockSetUserRole = vi.fn();

vi.mock('@/lib/api', () => ({
  getInvites: () => mockInvites(),
  getUsers: () => mockUsers(),
  createInvite: (email: string) => mockCreateInvite(email),
  revokeInvite: (id: string) => mockRevokeInvite(id),
  setUserActive: (id: string, isActive: boolean) => mockSetUserActive(id, isActive),
  setUserRole: (id: string, role: string) => mockSetUserRole(id, role),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  // Module-level mocks persist their call history across `it` blocks in this
  // file unless cleared here; without this, toHaveBeenCalledTimes assertions
  // in later tests see calls left over from earlier ones.
  vi.clearAllMocks();
  mockInvites.mockResolvedValue({
    invites: [
      { id: 'inv1', email: 'new@example.com', status: 'pending', invitedBy: { username: 'raul' }, createdAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-08T00:00:00.000Z', usedAt: null, revokedAt: null },
    ],
  });
  mockUsers.mockResolvedValue({
    users: [
      { id: 'me', username: 'raul', email: 'raul@example.com', role: 'ADMIN', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'OPERATOR', isActive: true, createdAt: '2026-02-01T00:00:00.000Z' },
    ],
  });
});

describe('TeamView', () => {
  it('lists pending invites and team members after loading', async () => {
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeTruthy());
    expect(screen.getByText('pending')).toBeTruthy();
    expect(screen.getByText('luciano')).toBeTruthy();
  });

  it('sends an invite and refreshes the list', async () => {
    const user = userEvent.setup();
    mockCreateInvite.mockResolvedValue({ success: true, invite: { id: 'inv2', email: 'second@example.com', expiresAt: '2026-09-08T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' } });
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeTruthy());

    await user.type(screen.getByLabelText(/email/i), 'second@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledWith('second@example.com'));
    expect(mockInvites).toHaveBeenCalledTimes(2); // initial load + refresh after send
  });

  it('revokes a pending invite', async () => {
    const user = userEvent.setup();
    mockRevokeInvite.mockResolvedValue(undefined);
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /revoke/i }));
    await waitFor(() => expect(mockRevokeInvite).toHaveBeenCalledWith('inv1'));
  });

  it('toggles a teammate to inactive, but disables the toggle for the signed-in admin', async () => {
    const user = userEvent.setup();
    mockSetUserActive.mockResolvedValue({ id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'OPERATOR', isActive: false, createdAt: '2026-02-01T00:00:00.000Z' });
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('luciano')).toBeTruthy());

    const deactivateButton = screen.getByRole('button', { name: /deactivate luciano/i });
    await user.click(deactivateButton);
    await waitFor(() => expect(mockSetUserActive).toHaveBeenCalledWith('u2', false));

    // This repo doesn't have @testing-library/jest-dom wired into vitest, so
    // assert the native DOM property directly instead of using toBeDisabled().
    expect(screen.getByRole('button', { name: /deactivate raul/i })).toHaveProperty('disabled', true);
  });

  it('changes a teammate\'s role and refreshes the list', async () => {
    const user = userEvent.setup();
    mockSetUserRole.mockResolvedValue({ id: 'u2', username: 'luciano', email: 'luciano@example.com', role: 'ADMIN', isActive: true, updatedAt: '2026-02-02T00:00:00.000Z' });
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('luciano')).toBeTruthy());

    await user.click(screen.getByRole('combobox', { name: /luciano.*role/i }));
    await user.click(await screen.findByRole('option', { name: 'Manager' }));

    await waitFor(() => expect(mockSetUserRole).toHaveBeenCalledWith('u2', 'ADMIN'));
    expect(mockUsers).toHaveBeenCalledTimes(2); // initial load + refresh after change
  });

  it('disables the role control for the signed-in admin\'s own row', async () => {
    render(<TeamView />);
    await waitFor(() => expect(screen.getByText('luciano')).toBeTruthy());

    expect(screen.getByRole('combobox', { name: /raul.*role/i })).toHaveProperty('disabled', true);
  });
});
