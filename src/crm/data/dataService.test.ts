import { describe, it, expect, vi, afterEach } from 'vitest';
import { toast } from 'sonner';
import { dataService } from './dataService';
import { EMPTY_STATE } from './types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Isolates these tests from src/lib/api's real getAuthHeaders(), which reads
// localStorage — unrelated to what's under test here, and the jsdom test
// environment's localStorage.getItem is not reliably callable synchronously.
vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost:8080',
  getAuthHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

// Flushes the microtask queue so assertions can observe what happens inside
// dataService.save()'s fire-and-forget promise chain (fetch -> .then/.catch).
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('dataService.load', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reports failure — not a genuine empty account — on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Session expired. Please sign in again.' }),
    }) as unknown as typeof fetch;

    const result = await dataService.load();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Session expired. Please sign in again.');
    }
  });

  it('reports failure on a thrown network error, distinct from an empty account', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await dataService.load();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('falls back to a generic message when a failed response has no JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    const result = await dataService.load();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns ok:true on a successful response, even when the account has no data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ leads: [], deals: [], tasks: [], activities: [], settings: undefined }),
    }) as unknown as typeof fetch;

    const result = await dataService.load();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.leads).toEqual([]);
    }
  });
});

describe('dataService.save', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('surfaces a 409 rejection to the user with the server message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Refusing to clear the CRM on an empty save. Reload and try again.',
      }),
    }) as unknown as typeof fetch;

    dataService.save(EMPTY_STATE);
    await flush();

    expect(toast.error).toHaveBeenCalledWith(
      'Refusing to clear the CRM on an empty save. Reload and try again.',
    );
  });

  it('surfaces a network failure to the user', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    dataService.save(EMPTY_STATE);
    await flush();

    expect(toast.error).toHaveBeenCalled();
  });

  it('does not show an error toast when the save succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;

    dataService.save(EMPTY_STATE);
    await flush();

    expect(toast.error).not.toHaveBeenCalled();
  });
});
