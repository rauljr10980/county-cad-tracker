import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InboxView, {
  ONE_DAY_MS,
  THREE_DAYS_MS,
  getWaitingTier,
  formatWaitingTime,
  type PublicSubmission,
} from './InboxView';

// ---------------------------------------------------------------------------
// Waiting-time tier boundaries — the "signature element" of this screen. Its
// whole job is to make an aging lead visually distinct from a fresh one, so
// getting the under-a-day / past-a-day / past-three-days edges right matters
// more than anything else on the page.
// ---------------------------------------------------------------------------

describe('getWaitingTier', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('is fresh for a submission that just arrived', () => {
    expect(getWaitingTier(ago(0), now)).toBe('fresh');
  });

  it('is fresh just under the one-day boundary', () => {
    expect(getWaitingTier(ago(ONE_DAY_MS - 1), now)).toBe('fresh');
  });

  it('turns aging exactly at the one-day boundary', () => {
    expect(getWaitingTier(ago(ONE_DAY_MS), now)).toBe('aging');
  });

  it('is still aging just under the three-day boundary', () => {
    expect(getWaitingTier(ago(THREE_DAYS_MS - 1), now)).toBe('aging');
  });

  it('turns stale exactly at the three-day boundary', () => {
    expect(getWaitingTier(ago(THREE_DAYS_MS), now)).toBe('stale');
  });

  it('is stale well past three days', () => {
    expect(getWaitingTier(ago(THREE_DAYS_MS * 5), now)).toBe('stale');
  });
});

describe('formatWaitingTime', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('reports under a minute as "Just now"', () => {
    expect(formatWaitingTime(ago(30_000), now)).toBe('Just now');
  });

  it('reports minutes under an hour', () => {
    expect(formatWaitingTime(ago(5 * 60_000), now)).toBe('5m');
  });

  it('reports hours under a day', () => {
    expect(formatWaitingTime(ago(3 * 60 * 60_000), now)).toBe('3h');
  });

  it('reports days at and beyond a day', () => {
    expect(formatWaitingTime(ago(ONE_DAY_MS), now)).toBe('1d');
    expect(formatWaitingTime(ago(4 * ONE_DAY_MS), now)).toBe('4d');
  });
});

// ---------------------------------------------------------------------------
// Rendering — mocks the /api/public/submissions surface InboxView calls
// (the main filtered list, the four per-status total lookups, and the single
// unfiltered "newest 100" lookup used for the summary strip). No aggregate
// endpoint exists, so the component makes several small requests; the mock
// below routes each by its query string rather than by call order.
// ---------------------------------------------------------------------------

const makeSubmission = (overrides: Partial<PublicSubmission> = {}): PublicSubmission => ({
  id: overrides.id ?? 'sub-1',
  sourcePage: 'landlord-help',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '210-555-0100',
  propertyAddress: '123 Main St',
  message: 'My tenant stopped paying rent three months ago and I need this handled.',
  status: 'new',
  notes: '',
  userAgent: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
}

/**
 * Routes a mocked fetch call by its query string:
 *  - `pageSize=10` + a `status` param   -> one of the four per-status totals
 *  - `pageSize=100`                     -> the bulk "newest 100" stats lookup
 *  - anything else                      -> the main paginated/filtered list
 */
function mockFetchRouter(opts: {
  statusTotals: Record<string, number>;
  bulkItems: PublicSubmission[];
  mainList: (params: URLSearchParams) => PublicSubmission[];
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const params = new URL(url).searchParams;
    const pageSize = params.get('pageSize');
    const status = params.get('status');

    if (pageSize === '10' && status) {
      return jsonResponse({ total: opts.statusTotals[status] ?? 0 });
    }
    if (pageSize === '100') {
      return jsonResponse({ items: opts.bulkItems, total: opts.bulkItems.length, pages: 1 });
    }
    const items = opts.mainList(params);
    return jsonResponse({ items, total: items.length, pages: 1 });
  });
}

// This test environment's jsdom `localStorage` isn't a working Storage object
// (`getItem` is undefined), unrelated to InboxView itself — every view in the
// app reads it via getAuthHeaders(). Stub a minimal one so requests go through.
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

describe('InboxView empty states', () => {
  beforeEach(() => {
    stubLocalStorage();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tells the user the inbox is genuinely empty when nothing has ever arrived', async () => {
    vi.stubGlobal('fetch', mockFetchRouter({
      statusTotals: { new: 0, contacted: 0, converted: 0, spam: 0 },
      bulkItems: [],
      mainList: () => [],
    }));

    render(<InboxView />);

    await waitFor(() => expect(screen.getByText('No submissions yet')).toBeTruthy());
    // The real reason it's empty — no forms are live yet — must be named, not implied.
    expect(screen.getByText(/none of those forms are live on the site yet/i)).toBeTruthy();
    expect(screen.queryByText('No submissions match these filters')).toBeNull();
    expect(screen.queryByText('Clear filters')).toBeNull();
  });

  it('distinguishes a filter excluding everything from a truly empty inbox, and can clear it', async () => {
    const existing = [makeSubmission({ id: 'a' })];
    vi.stubGlobal('fetch', mockFetchRouter({
      // Non-zero global counts: submissions exist, they're just filtered out below.
      statusTotals: { new: 2, contacted: 1, converted: 3, spam: 0 },
      bulkItems: existing,
      mainList: (params) => (params.get('sourcePage') ? [] : existing),
    }));

    render(<InboxView />);

    // Starts unfiltered, with a real row visible.
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());

    // Filtering by source page excludes the only submission.
    fireEvent.change(screen.getByLabelText('SOURCE PAGE'), { target: { value: 'landlord-help' } });

    await waitFor(() => expect(screen.getByText('No submissions match these filters')).toBeTruthy());
    // The message names the excluding filter — check the sentence itself, not
    // just any element containing "Landlord Help" (the source-page <option> does too).
    expect(screen.getByText(/excluding everything here/).textContent).toContain('Landlord Help');
    expect(screen.queryByText('No submissions yet')).toBeNull();

    // Clearing the filter brings the row back.
    fireEvent.click(screen.getByText('Clear filters'));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    expect((screen.getByLabelText('SOURCE PAGE') as HTMLSelectElement).value).toBe('');
  });
});

describe('InboxView rows', () => {
  beforeEach(() => {
    stubLocalStorage();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('colors the waiting time by tier: muted when fresh, destructive when stale', async () => {
    // Both marked "contacted" (not "new") so neither is picked up by the summary
    // strip's "longest wait among unworked" tile — keeps this test focused on
    // just the per-row badge instead of also asserting on the summary strip.
    const fresh = makeSubmission({ id: 'fresh', name: 'Fresh Lead', status: 'contacted', createdAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    const stale = makeSubmission({ id: 'stale', name: 'Stale Lead', status: 'contacted', createdAt: new Date(Date.now() - 4 * ONE_DAY_MS).toISOString() });

    vi.stubGlobal('fetch', mockFetchRouter({
      statusTotals: { new: 2, contacted: 0, converted: 0, spam: 0 },
      bulkItems: [fresh, stale],
      mainList: () => [fresh, stale],
    }));

    render(<InboxView />);

    await waitFor(() => expect(screen.getByText('Fresh Lead')).toBeTruthy());

    const freshWait = screen.getByText('5m');
    expect(freshWait.className).toContain('text-muted-foreground');

    const staleWait = screen.getByText('4d');
    expect(staleWait.className).toContain('text-destructive');
  });

  it('makes phone and email click-to-act via tel: and mailto: links', async () => {
    const item = makeSubmission();
    vi.stubGlobal('fetch', mockFetchRouter({
      statusTotals: { new: 1, contacted: 0, converted: 0, spam: 0 },
      bulkItems: [item],
      mainList: () => [item],
    }));

    render(<InboxView />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    expect(screen.getByRole('link', { name: item.phone }).getAttribute('href')).toBe(`tel:${item.phone}`);
    expect(screen.getByRole('link', { name: item.email }).getAttribute('href')).toBe(`mailto:${item.email}`);
  });
});
