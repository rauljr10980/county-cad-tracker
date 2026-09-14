import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailSettingsDialog from './EmailSettingsDialog';

const mockGetSettings = vi.fn();
const mockSetSettings = vi.fn();
const mockClearSettings = vi.fn();
const mockSendTest = vi.fn();
const mockSetUserSettings = vi.fn();
const mockClearUserSettings = vi.fn();
const mockSendTestForUser = vi.fn();

vi.mock('@/lib/api', () => ({
  getMyEmailSettings: () => mockGetSettings(),
  setMyEmailSettings: (u: string, p: string) => mockSetSettings(u, p),
  clearMyEmailSettings: () => mockClearSettings(),
  sendTestEmail: (to?: string) => mockSendTest(to),
  setUserEmailSettings: (id: string, u: string, p: string) => mockSetUserSettings(id, u, p),
  clearUserEmailSettings: (id: string) => mockClearUserSettings(id),
  sendTestEmailForUser: (id: string, to?: string) => mockSendTestForUser(id, to),
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
    expect(mockSendTest).toHaveBeenCalledWith('me@gmail.com');
  });

  it('prefills the test-to field with the configured address but lets it be changed', async () => {
    const user = userEvent.setup();
    mockGetSettings.mockResolvedValue({ configured: true, smtpUsername: 'me@gmail.com' });
    mockSendTest.mockResolvedValue({ success: true });
    render(<EmailSettingsDialog isOpen onClose={() => {}} />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

    const testToField = screen.getByLabelText(/send test to/i) as HTMLInputElement;
    expect(testToField.value).toBe('me@gmail.com');

    await user.clear(testToField);
    await user.type(testToField, 'someone-else@example.com');
    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(mockSendTest).toHaveBeenCalledWith('someone-else@example.com'));
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

  it('admin mode: shows the teammate\'s name in the title and seeds fields without an extra load call', async () => {
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: 'jane@gmail.com', smtpConfigured: true }}
      />
    );

    expect(await screen.findByText('Email Settings — jane')).toBeTruthy();
    expect(mockGetSettings).not.toHaveBeenCalled();
    const usernameField = screen.getByLabelText(/gmail address/i) as HTMLInputElement;
    expect(usernameField.value).toBe('jane@gmail.com');
  });

  it('admin mode: Save calls setUserEmailSettings with the target id, not the self-service function', async () => {
    const user = userEvent.setup();
    mockSetUserSettings.mockResolvedValue({ smtpConfigured: true, smtpUsername: 'jane@gmail.com' });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: null, smtpConfigured: false }}
      />
    );

    await user.type(screen.getByLabelText(/gmail address/i), 'jane@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mockSetUserSettings).toHaveBeenCalledWith('u9', 'jane@gmail.com', 'abcd efgh ijkl mnop'));
    expect(mockSetSettings).not.toHaveBeenCalled();
  });

  it('admin mode: Deactivate calls clearUserEmailSettings with the target id', async () => {
    const user = userEvent.setup();
    mockClearUserSettings.mockResolvedValue({ smtpConfigured: false });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: 'jane@gmail.com', smtpConfigured: true }}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /deactivate/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => expect(mockClearUserSettings).toHaveBeenCalledWith('u9'));
    expect(mockClearSettings).not.toHaveBeenCalled();
  });

  it('admin mode: Send test email calls sendTestEmailForUser with the target id and the typed address', async () => {
    const user = userEvent.setup();
    mockSendTestForUser.mockResolvedValue({ success: true });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: 'jane@gmail.com', smtpConfigured: true }}
      />
    );

    const testToField = screen.getByLabelText(/send test to/i) as HTMLInputElement;
    expect(testToField.value).toBe('jane@gmail.com');
    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(mockSendTestForUser).toHaveBeenCalledWith('u9', 'jane@gmail.com'));
    expect(mockSendTest).not.toHaveBeenCalled();
  });

  it('admin mode: calls onChanged after a successful save', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    mockSetUserSettings.mockResolvedValue({ smtpConfigured: true, smtpUsername: 'jane@gmail.com' });
    render(
      <EmailSettingsDialog
        isOpen
        onClose={() => {}}
        targetUser={{ id: 'u9', username: 'jane', email: 'jane@example.com', smtpUsername: null, smtpConfigured: false }}
        onChanged={onChanged}
      />
    );

    await user.type(screen.getByLabelText(/gmail address/i), 'jane@gmail.com');
    await user.type(screen.getByLabelText(/app password/i), 'abcd efgh ijkl mnop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
