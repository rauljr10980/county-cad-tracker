import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailSettingsDialog from './EmailSettingsDialog';

const mockGetSettings = vi.fn();
const mockSetSettings = vi.fn();
const mockClearSettings = vi.fn();
const mockSendTest = vi.fn();

vi.mock('@/lib/api', () => ({
  getMyEmailSettings: () => mockGetSettings(),
  setMyEmailSettings: (u: string, p: string) => mockSetSettings(u, p),
  clearMyEmailSettings: () => mockClearSettings(),
  sendTestEmail: () => mockSendTest(),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettings.mockResolvedValue({ configured: false, smtpUsername: null });
});

describe('EmailSettingsDialog', () => {
  it('loads and shows the not-configured state', async () => {
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull();
  });

  it('saves the entered address and app password', async () => {
    const user = userEvent.setup();
    mockSetSettings.mockResolvedValue({ configured: true });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/gmail address/i), 'me@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledWith('me@gmail.com', 'abcd efgh ijkl mnop'));
  });

  it('shows the exact error message inline when the test send fails', async () => {
    const user = userEvent.setup();
    mockGetSettings.mockResolvedValue({ configured: true, smtpUsername: 'me@gmail.com' });
    mockSendTest.mockResolvedValue({ success: false, error: 'Invalid login: 535-5.7.8' });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    expect(await screen.findByText('Invalid login: 535-5.7.8')).toBeTruthy();
  });

  it('shows a Deactivate button once configured, and clears settings when clicked', async () => {
    const user = userEvent.setup();
    mockGetSettings.mockResolvedValue({ configured: true, smtpUsername: 'me@gmail.com' });
    mockClearSettings.mockResolvedValue({ configured: false });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => expect(mockClearSettings).toHaveBeenCalled());
  });
});
