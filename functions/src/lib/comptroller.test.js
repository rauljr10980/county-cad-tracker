import { describe, it, expect } from 'vitest';
import { searchEntity, normalizeEntity, COMPTROLLER_BASE } from './comptroller.js';

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status, body) => async () => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });

describe('searchEntity', () => {
  it('refuses without an API key rather than calling out', async () => {
    let called = false;
    const result = await searchEntity('Baabco Properties II LLC', {
      apiKey: '',
      fetchImpl: async () => { called = true; },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/COMPTROLLER_API_KEY/);
    expect(called).toBe(false);
  });

  it('refuses an empty name', async () => {
    const result = await searchEntity('  ', { apiKey: 'k', fetchImpl: async () => { throw new Error('should not run'); } });
    expect(result.ok).toBe(false);
  });

  it('sends the key in the header and the name in the query', async () => {
    let seenUrl = '';
    let seenHeaders = {};
    await searchEntity('Baabco Properties II LLC', {
      apiKey: 'secret',
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenHeaders = init.headers;
        return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{}' };
      },
    });
    expect(seenUrl.startsWith(`${COMPTROLLER_BASE}/search`)).toBe(true);
    expect(seenUrl).toContain('Baabco');
    expect(seenHeaders['x-api-key']).toBe('secret');
  });

  it('honours an overridden query parameter name', async () => {
    let seenUrl = '';
    await searchEntity('Acme LLC', {
      apiKey: 'k',
      param: 'entityName',
      fetchImpl: async (url) => { seenUrl = url; return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; },
    });
    expect(seenUrl).toContain('entityName=');
  });

  it('reports an auth failure without leaking the key', async () => {
    const result = await searchEntity('Acme LLC', {
      apiKey: 'supersecret',
      fetchImpl: fail(403, { message: 'Forbidden' }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
    expect(JSON.stringify(result)).not.toContain('supersecret');
  });

  it('returns results from any of the shapes the API might use', async () => {
    const row = { taxpayerNumber: '32096713030', taxpayerName: 'ACME LLC' };
    for (const body of [{ data: [row] }, { results: [row] }, [row]]) {
      const result = await searchEntity('ACME', { apiKey: 'k', fetchImpl: ok(body) });
      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(1);
    }
  });

  it('treats an unrecognised shape as no results, not as a crash', async () => {
    const result = await searchEntity('ACME', { apiKey: 'k', fetchImpl: ok({ unexpected: true }) });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });
});

describe('normalizeEntity', () => {
  it('maps camelCase fields', () => {
    expect(normalizeEntity({
      taxpayerNumber: '32096713030', taxpayerName: 'ACME LLC',
      taxpayerAddress: '1 MAIN ST', taxpayerCity: 'SAN ANTONIO',
      taxpayerState: 'TX', taxpayerZip: '78201',
    })).toEqual({
      taxpayerNumber: '32096713030', name: 'ACME LLC',
      address: '1 MAIN ST', city: 'SAN ANTONIO', state: 'TX', zip: '78201',
      fileNumber: '', status: '',
    });
  });

  it('maps the snake_case field names the open dataset uses', () => {
    const result = normalizeEntity({
      taxpayer_number: '1', taxpayer_name: 'B LLC', taxpayer_address: '2 OAK',
      taxpayer_city: 'AUSTIN', taxpayer_state: 'TX', taxpayer_zip: '78701',
      secretary_of_state_sos_or_coa_file_number: '0801',
    });
    expect(result.name).toBe('B LLC');
    expect(result.fileNumber).toBe('0801');
  });

  it('never returns undefined for a missing field', () => {
    const result = normalizeEntity({});
    Object.values(result).forEach((value) => expect(typeof value).toBe('string'));
  });
});
