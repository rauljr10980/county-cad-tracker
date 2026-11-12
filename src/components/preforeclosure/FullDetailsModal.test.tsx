import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FullDetailsModal } from './FullDetailsModal';
import type { PreForeclosureRecord } from '@/types/property';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/hooks/usePreForeclosure', () => ({
  useUpdatePreForeclosure: () => ({ mutateAsync: save, isPending: false }),
  useOwnerLookup: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/email/SendEmailPanel', () => ({ SendEmailPanel: () => null }));
vi.mock('./PreForeclosureVisitWizard', () => ({ PreForeclosureVisitWizard: () => null }));

const paste = 'John Smith\nAge 54\nPhone Numbers\n(210) 555-0101 - Wireless\nPhone Number: +1 830-555-0102\n210.555.0101\nEmail Addresses\njohn@example.com';
function mount(overrides: Partial<PreForeclosureRecord> = {}) {
  const record = {
    document_number: 'TEST-DOC', type: 'Mortgage', address: '123 Test St', city: 'San Antonio', state: 'TX', zip: '78208',
    ownerName: 'John Smith', phoneNumbers: [], emails: [], workflow_stage: 'not_started', status: 'active',
    ...overrides,
  } as PreForeclosureRecord;
  return render(<QueryClientProvider client={new QueryClient()}><FullDetailsModal record={record} isOpen onClose={() => {}} /></QueryClientProvider>);
}
beforeEach(() => { save.mockReset(); save.mockResolvedValue({ success: true }); });

describe('pre-foreclosure TruePeopleSearch extraction', () => {
  it('places all unique extracted numbers in the phone number inputs and persists them with contact rows', async () => {
    mount();
    fireEvent.click(await screen.findByText('True People Search Contact Extractor'));
    fireEvent.change(screen.getByPlaceholderText(/Paste raw text from TruePeopleSearch/), { target: { value: paste } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract Contacts' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue('(210) 555-0101')).toBeTruthy();
    expect(screen.getByDisplayValue('(830) 555-0102')).toBeTruthy();
    expect(save.mock.calls[0][0]).toMatchObject({
      document_number: 'TEST-DOC', phoneNumbers: ['(210) 555-0101', '(830) 555-0102'], emails: ['john@example.com'],
      contacts: { phoneRows: [{ name: 'John Smith', phones: ['(210) 555-0101', '(830) 555-0102'] }] },
    });
  });

  it('keeps existing phones and emails when the same person is extracted again', async () => {
    mount({ phoneNumbers: ['(210) 555-0101'], emails: ['john@example.com'] });
    fireEvent.click(await screen.findByText('True People Search Contact Extractor'));
    fireEvent.change(screen.getByPlaceholderText(/Paste raw text from TruePeopleSearch/), { target: { value: paste } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract Contacts' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ phoneNumbers: ['(210) 555-0101', '(830) 555-0102'], emails: ['john@example.com'] });
    expect(screen.getAllByDisplayValue('(210) 555-0101')).toHaveLength(1);
  });
});
