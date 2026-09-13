import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EvictionLeadsView from './EvictionLeadsView';

vi.mock('@/components/contacts/ContactWorkspace', () => ({
  ContactWorkspace: () => null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

// This test environment's jsdom `localStorage` isn't a working Storage object
// (`getItem` is undefined), unrelated to this feature — every view in the app
// reads it via getAuthHeaders(). Stub a minimal one so requests go through.
// (Same workaround as src/components/inbox/InboxView.test.tsx.)
const stubLocalStorage = () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });
};

function mockFetch(listBody: unknown, detailBody: unknown) {
  return vi.fn((url: string) => {
    const isDetail = /\/landlords\/[^/?]+$/.test(url);
    return Promise.resolve({
      ok: true,
      text: async () => JSON.stringify(isDetail ? detailBody : listBody),
    });
  });
}

describe('EvictionLeadsView row actions', () => {
  it('renders an Eye icon per row that opens the same detail view as clicking the row', async () => {
    const listBody = {
      items: [{ id: 'e1', name: 'SANCHEZ, GERARDO', isCorporate: false, contactStage: 'New Lead', serviceInterests: [], contacts: {}, notes: '', filingCount: 1, addressCount: 1, ownedPropertyCount: 0 }],
      total: 1,
      pages: 1,
    };
    const detailBody = { ...listBody.items[0], addresses: [], filings: [], activities: [], tasks: [], contacts: {} };
    const fetchMock = mockFetch(listBody, detailBody);
    stubLocalStorage();
    vi.stubGlobal('fetch', fetchMock);

    render(<EvictionLeadsView />);
    await waitFor(() => expect(screen.getByText('SANCHEZ, GERARDO')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    await waitFor(() => {
      const detailCall = fetchMock.mock.calls.find(([url]) => /\/landlords\/e1$/.test(url as string));
      expect(detailCall).toBeTruthy();
    });
  });
});
