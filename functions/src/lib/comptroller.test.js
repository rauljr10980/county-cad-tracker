import { describe, it, expect } from 'vitest';
import { searchEntity, getEntity, normalizeEntity, COMPTROLLER_BASE } from './comptroller.js';

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status, body) => async () => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });

// Real sample payloads, as verified live against
// GET https://comptroller.texas.gov/data-search/franchise-tax?name=MIHAILA%20HOLDINGS
// and GET https://comptroller.texas.gov/data-search/franchise-tax/32085984956
const SEARCH_RESPONSE = {
  success: true,
  data: [{ name: 'MIHAILA HOLDINGS CORP', taxpayerId: '32085984956', mailingAddressZip: '78006' }],
  count: 1,
};

const DETAIL_RESPONSE = {
  success: true,
  data: {
    taxpayerId: '32085984956',
    feiNumber: null,
    name: 'MIHAILA HOLDINGS CORP',
    dbaName: null,
    mailingAddressStreet: '797 CROWN JEWEL',
    mailingAddressCity: 'BOERNE',
    mailingAddressState: 'TX',
    mailingAddressZip: '78006',
    mailingAddressZip4: '0378',
    rightToTransactTX: 'ACTIVE',
    stateOfFormation: ' IL', // leading space, as observed live
    sosRegistrationStatus: 'ACTIVE',
    effectiveSosRegistrationDate: '08/22/2022',
    sosFileNumber: '0804695894',
    registeredAgentName: 'ALEX J MIHAILA',
    registeredOfficeAddressStreet: '797 CROWN JEWEL',
    registeredOfficeAddressCity: 'BOERNE',
    registeredOfficeAddressState: 'TX',
    registeredOfficeAddressZip: '78006',
    taxId: 13,
    lastUpdated: '2026-09-01T01:49:57.033Z',
    reportYear: '2025',
    officerInfo: [
      { AGNT_NM: 'ALEX J MIHAILA', AGNT_TITL_TX: 'DIRECTOR', AGNT_ACTV_YR: '2025', AD_STR_POB_TX: '797 CROWN JEWEL', CITY_NM: 'BOERNE', ST_CD: 'TX', AD_ZP: '78006', SOURCE: 'CPA' },
      { AGNT_NM: 'ALEX J MIHAILA', AGNT_TITL_TX: 'PRESIDENT', AGNT_ACTV_YR: '2025', AD_STR_POB_TX: '797 CROWN JEWEL', CITY_NM: 'BOERNE', ST_CD: 'TX', AD_ZP: '78006', SOURCE: 'CPA' },
    ],
  },
};

describe('searchEntity', () => {
  it('refuses an empty name without calling out', async () => {
    let called = false;
    const result = await searchEntity('  ', { fetchImpl: async () => { called = true; } });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('sends the name in the query, with no auth header', async () => {
    let seenUrl = '';
    let seenInit = null;
    const result = await searchEntity('MIHAILA HOLDINGS', {
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenInit = init;
        return { ok: true, status: 200, json: async () => SEARCH_RESPONSE, text: async () => '{}' };
      },
    });
    expect(seenUrl.startsWith(COMPTROLLER_BASE)).toBe(true);
    expect(seenUrl).toContain('name=MIHAILA');
    expect(seenInit.headers['x-api-key']).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('returns results from a successful search', async () => {
    const result = await searchEntity('MIHAILA HOLDINGS', { fetchImpl: ok(SEARCH_RESPONSE) });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      { name: 'MIHAILA HOLDINGS CORP', taxpayerId: '32085984956', zip: '78006' },
    ]);
  });

  it('returns an empty result set for a search with no matches', async () => {
    const result = await searchEntity('NO SUCH ENTITY', { fetchImpl: ok({ success: true, data: [], count: 0 }) });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });

  it('surfaces success:false and its error string, even on HTTP 200', async () => {
    const result = await searchEntity('ACME', {
      fetchImpl: ok({ success: false, error: '"q" is not allowed' }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('"q" is not allowed');
  });

  it('surfaces success:false and its error string on an HTTP 400', async () => {
    const result = await searchEntity('ACME', {
      fetchImpl: fail(400, { success: false, error: '"q" is not allowed' }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('"q" is not allowed');
  });

  it('reports a plain HTTP error without a success:false body', async () => {
    const result = await searchEntity('ACME', { fetchImpl: fail(500, { message: 'Internal Server Error' }) });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('treats an unrecognised shape as no results, not as a crash', async () => {
    const result = await searchEntity('ACME', { fetchImpl: ok({ unexpected: true }) });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });
});

describe('normalizeEntity', () => {
  it('maps the real detail-record field names', () => {
    const result = normalizeEntity(DETAIL_RESPONSE.data);
    expect(result.taxpayerId).toBe('32085984956');
    expect(result.name).toBe('MIHAILA HOLDINGS CORP');
    expect(result.mailingAddress).toBe('797 CROWN JEWEL, BOERNE, TX 78006');
    expect(result.rightToTransact).toBe('ACTIVE');
    expect(result.sosRegistrationStatus).toBe('ACTIVE');
    expect(result.sosRegistrationDate).toBe('08/22/2022');
    expect(result.sosFileNumber).toBe('0804695894');
    expect(result.registeredAgentName).toBe('ALEX J MIHAILA');
    expect(result.registeredOfficeAddress).toBe('797 CROWN JEWEL, BOERNE, TX 78006');
  });

  it('trims the leading space off stateOfFormation', () => {
    const result = normalizeEntity(DETAIL_RESPONSE.data);
    expect(result.stateOfFormation).toBe('IL');
  });

  it('never returns undefined for a missing field', () => {
    const result = normalizeEntity({});
    const { officers, ...strings } = result;
    Object.values(strings).forEach((value) => expect(typeof value).toBe('string'));
    expect(officers).toEqual([]);
  });

  it('maps officerInfo to a clean array and dedupes only exact name+title duplicates', () => {
    const result = normalizeEntity(DETAIL_RESPONSE.data);
    // Same person, two distinct titles — both kept.
    expect(result.officers).toEqual([
      { name: 'ALEX J MIHAILA', title: 'DIRECTOR', address: '797 CROWN JEWEL, BOERNE, TX 78006' },
      { name: 'ALEX J MIHAILA', title: 'PRESIDENT', address: '797 CROWN JEWEL, BOERNE, TX 78006' },
    ]);
  });

  it('drops an exact duplicate officer row (same name and title)', () => {
    const withDupe = {
      ...DETAIL_RESPONSE.data,
      officerInfo: [
        ...DETAIL_RESPONSE.data.officerInfo,
        { AGNT_NM: 'ALEX J MIHAILA', AGNT_TITL_TX: 'PRESIDENT', AD_STR_POB_TX: '797 CROWN JEWEL', CITY_NM: 'BOERNE', ST_CD: 'TX', AD_ZP: '78006' },
      ],
    };
    const result = normalizeEntity(withDupe);
    expect(result.officers).toHaveLength(2);
  });
});

describe('getEntity', () => {
  it('refuses an empty taxpayer id without calling out', async () => {
    let called = false;
    const result = await getEntity('  ', { fetchImpl: async () => { called = true; } });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
    expect(called).toBe(false);
  });

  it('requests the taxpayer id in the path, with no auth header', async () => {
    let seenUrl = '';
    let seenInit = null;
    await getEntity('32085984956', {
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenInit = init;
        return { ok: true, status: 200, json: async () => DETAIL_RESPONSE, text: async () => '{}' };
      },
    });
    expect(seenUrl).toBe(`${COMPTROLLER_BASE}/32085984956`);
    expect(seenInit.headers['x-api-key']).toBeUndefined();
  });

  it('returns the full record — including the registered agent and officers — from a successful detail lookup', async () => {
    const result = await getEntity('32085984956', { fetchImpl: ok(DETAIL_RESPONSE) });
    expect(result.ok).toBe(true);
    expect(result.entity.taxpayerId).toBe('32085984956');
    expect(result.entity.registeredAgentName).toBe('ALEX J MIHAILA');
    expect(result.entity.officers).toHaveLength(2);
  });

  it('surfaces success:false and its error string, even on HTTP 200', async () => {
    const result = await getEntity('1', { fetchImpl: ok({ success: false, error: '"q" is not allowed' }) });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
    expect(result.error).toBe('"q" is not allowed');
  });

  it('reports a plain HTTP error without a success:false body', async () => {
    const result = await getEntity('1', { fetchImpl: fail(404, { message: 'Not Found' }) });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
    expect(result.error).toContain('404');
  });

  it('treats an unrecognised shape as a failure, not a crash, and logs the raw body', async () => {
    const result = await getEntity('1', { fetchImpl: ok({ success: true, data: [] }) });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
  });
});
