import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useEvictionLeadsCount, useMlsLeadsCount } from './useLeadCounts';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function stubLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEvictionLeadsCount', () => {
  it('reads total from the landlords endpoint with a minimal page size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ items: [], total: 3139, pages: 3139 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEvictionLeadsCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(3139));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/evictions/landlords');
    expect(url).toContain('page=1');
    expect(url).toContain('pageSize=1');
  });
});

describe('useMlsLeadsCount', () => {
  it('reads total from the mls-leads endpoint with a minimal page size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ items: [], total: 2321, pages: 2321 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMlsLeadsCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(2321));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/mls-leads');
    expect(url).toContain('page=1');
    expect(url).toContain('pageSize=1');
  });
});
