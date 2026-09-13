import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MlsLeadsView from './MlsLeadsView';

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
    const isDetail = /\/api\/mls-leads\/[^/?]+$/.test(url);
    return Promise.resolve({
      ok: true,
      text: async () => JSON.stringify(isDetail ? detailBody : listBody),
    });
  });
}

describe('MlsLeadsView row actions', () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it('renders an Eye icon per row alongside Hide, opening the same detail as clicking the row', async () => {
    const item = { id: 'm1', address: '123 Main St', status: 'ACT', totalUnits: 2, price: 300000, county: 'Bexar', hidden: false, contacts: [] };
    const listBody = { items: [item], total: 1, pages: 1 };
    const fetchMock = mockFetch(listBody, item);
    vi.stubGlobal('fetch', fetchMock);

    render(<MlsLeadsView />);
    await waitFor(() => expect(screen.getByText('123 Main St')).toBeTruthy());

    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    await waitFor(() => {
      const detailCall = fetchMock.mock.calls.find(([url]) => /\/api\/mls-leads\/m1$/.test(url as string));
      expect(detailCall).toBeTruthy();
    });
  });
});
