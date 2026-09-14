import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ManagementView from './ManagementView';

const mockGetTeamEmailSettings = vi.fn();
const mockSendTest = vi.fn();

vi.mock('@/lib/api', () => ({
  getTeamEmailSettings: () => mockGetTeamEmailSettings(),
  getMyEmailSettings: vi.fn(),
  setMyEmailSettings: vi.fn(),
  clearMyEmailSettings: vi.fn(),
  sendTestEmail: vi.fn(),
  setUserEmailSettings: vi.fn().mockResolvedValue({ smtpConfigured: true, smtpUsername: 'jane@gmail.com' }),
  clearUserEmailSettings: vi.fn().mockResolvedValue({ smtpConfigured: false }),
  sendTestEmailForUser: (id: string, to?: string) => mockSendTest(id, to),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTeamEmailSettings.mockResolvedValue({
    users: [
      { id: 'u1', username: 'admin', email: 'admin@example.com', role: 'ADMIN', smtpUsername: null, smtpConfigured: false },
      { id: 'u9', username: 'jane', email: 'jane@example.com', role: 'OPERATOR', smtpUsername: 'jane@gmail.com', smtpConfigured: true },
    ],
  });
});

describe('ManagementView', () => {
  it('renders each teammate with their configured/not-configured status', async () => {
    render(<ManagementView />);
    await waitFor(() => expect(mockGetTeamEmailSettings).toHaveBeenCalled());

    expect(screen.getByText('admin')).toBeTruthy();
    expect(screen.getByText('jane')).toBeTruthy();
    expect(screen.getByText('Not configured')).toBeTruthy();
    expect(screen.getByText('Configured')).toBeTruthy();
  });

  it('opens the EmailSettingsDialog in admin mode for the clicked row', async () => {
    const user = userEvent.setup();
    render(<ManagementView />);
    await waitFor(() => expect(screen.getByText('jane')).toBeTruthy());

    const rows = screen.getAllByRole('row');
    const janeRow = rows.find((r) => r.textContent?.includes('jane'));
    await user.click(janeRow!.querySelector('button')!);

    expect(await screen.findByText('Email Settings — jane')).toBeTruthy();
  });

  it('reloads the roster after a change in the dialog', async () => {
    const user = userEvent.setup();
    render(<ManagementView />);
    await waitFor(() => expect(screen.getByText('admin')).toBeTruthy());

    const rows = screen.getAllByRole('row');
    const adminRow = rows.find((r) => r.textContent?.includes('admin'));
    await user.click(adminRow!.querySelector('button')!);

    await screen.findByText('Email Settings — admin');
    await user.type(screen.getByLabelText(/gmail address/i), 'admin@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockGetTeamEmailSettings).toHaveBeenCalledTimes(2));
  });
});
