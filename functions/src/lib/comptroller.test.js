import { describe, it, expect } from 'vitest';
import { searchEntity, getEntity, normalizeEntity, COMPTROLLER_BASE } from './comptroller.js';

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
      registeredAgentName: '', registeredOfficeAddress: '', stateOfFormation: '',
      sosRegistrationStatus: '', sosRegistrationDate: '', rightToTransact: '',
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

  // Confirmed live on the Franchise Tax Account Status detail record for
  // Mihaila Holdings Corp: Registered Agent Name "ALEX J MIHAILA",
  // Registered Office Street Address "797 CROWN JEWEL, BOERNE, TX 78006".
  // The exact JSON key the API uses for each is unverified, so several
  // plausible spellings are accepted.
  it('maps the registered agent and detail-record fields (camelCase)', () => {
    const result = normalizeEntity({
      taxpayerNumber: '32085984956',
      registeredAgentName: 'ALEX J MIHAILA',
      registeredOfficeAddress: '797 CROWN JEWEL, BOERNE, TX 78006',
      stateOfFormation: 'IL',
      sosRegistrationStatus: 'ACTIVE',
      sosRegistrationDate: '08/22/2022',
      rightToTransact: 'ACTIVE',
    });
    expect(result.registeredAgentName).toBe('ALEX J MIHAILA');
    expect(result.registeredOfficeAddress).toBe('797 CROWN JEWEL, BOERNE, TX 78006');
    expect(result.stateOfFormation).toBe('IL');
    expect(result.sosRegistrationStatus).toBe('ACTIVE');
    expect(result.sosRegistrationDate).toBe('08/22/2022');
    expect(result.rightToTransact).toBe('ACTIVE');
  });

  it('maps the same fields under their snake_case spellings', () => {
    const result = normalizeEntity({
      registered_agent_name: 'ALEX J MIHAILA',
      registered_office_address: '797 CROWN JEWEL, BOERNE, TX 78006',
      state_of_formation: 'IL',
      sos_registration_status: 'ACTIVE',
      sos_registration_date: '08/22/2022',
      right_to_transact: 'ACTIVE',
    });
    expect(result.registeredAgentName).toBe('ALEX J MIHAILA');
    expect(result.registeredOfficeAddress).toBe('797 CROWN JEWEL, BOERNE, TX 78006');
    expect(result.stateOfFormation).toBe('IL');
    expect(result.sosRegistrationStatus).toBe('ACTIVE');
    expect(result.sosRegistrationDate).toBe('08/22/2022');
    expect(result.rightToTransact).toBe('ACTIVE');
  });

  it('maps the remaining plausible spellings for the registered agent, office address, SOS date, and right-to-transact', () => {
    expect(normalizeEntity({ agentName: 'A' }).registeredAgentName).toBe('A');
    expect(normalizeEntity({ agent_name: 'A' }).registeredAgentName).toBe('A');
    expect(normalizeEntity({ raName: 'A' }).registeredAgentName).toBe('A');
    expect(normalizeEntity({ ra_name: 'A' }).registeredAgentName).toBe('A');

    expect(normalizeEntity({ registeredOfficeStreetAddress: 'B' }).registeredOfficeAddress).toBe('B');
    expect(normalizeEntity({ registered_office_street_address: 'B' }).registeredOfficeAddress).toBe('B');
    expect(normalizeEntity({ agentAddress: 'B' }).registeredOfficeAddress).toBe('B');
    expect(normalizeEntity({ agent_address: 'B' }).registeredOfficeAddress).toBe('B');
    expect(normalizeEntity({ raAddress: 'B' }).registeredOfficeAddress).toBe('B');
    expect(normalizeEntity({ ra_address: 'B' }).registeredOfficeAddress).toBe('B');

    expect(normalizeEntity({ effectiveSosRegistrationDate: '08/22/2022' }).sosRegistrationDate).toBe('08/22/2022');
    expect(normalizeEntity({ effective_sos_registration_date: '08/22/2022' }).sosRegistrationDate).toBe('08/22/2022');

    expect(normalizeEntity({ rightToTransactBusiness: 'ACTIVE' }).rightToTransact).toBe('ACTIVE');
    expect(normalizeEntity({ right_to_transact_business: 'ACTIVE' }).rightToTransact).toBe('ACTIVE');
    expect(normalizeEntity({ rightToTransactBusinessInTexas: 'ACTIVE' }).rightToTransact).toBe('ACTIVE');
    expect(normalizeEntity({ right_to_transact_business_in_texas: 'ACTIVE' }).rightToTransact).toBe('ACTIVE');
  });

  it('returns empty strings, never undefined, for the new fields when absent', () => {
    const result = normalizeEntity({ taxpayerNumber: '1' });
    expect(result.registeredAgentName).toBe('');
    expect(result.registeredOfficeAddress).toBe('');
    expect(result.stateOfFormation).toBe('');
    expect(result.sosRegistrationStatus).toBe('');
    expect(result.sosRegistrationDate).toBe('');
    expect(result.rightToTransact).toBe('');
  });
});

describe('getEntity', () => {
  it('refuses without an API key rather than calling out', async () => {
    let called = false;
    const result = await getEntity('32085984956', {
      apiKey: '',
      fetchImpl: async () => { called = true; },
    });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
    expect(result.error).toMatch(/COMPTROLLER_API_KEY/);
    expect(called).toBe(false);
  });

  it('refuses an empty taxpayer number', async () => {
    const result = await getEntity('  ', { apiKey: 'k', fetchImpl: async () => { throw new Error('should not run'); } });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
  });

  it('sends the key in the header and the taxpayer number in the path', async () => {
    let seenUrl = '';
    let seenHeaders = {};
    await getEntity('32085984956', {
      apiKey: 'secret',
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenHeaders = init.headers;
        return { ok: true, status: 200, json: async () => ({ taxpayerNumber: '32085984956' }), text: async () => '{}' };
      },
    });
    expect(seenUrl).toBe(`${COMPTROLLER_BASE}/32085984956`);
    expect(seenHeaders['x-api-key']).toBe('secret');
  });

  it('reports an auth failure without leaking the key', async () => {
    const result = await getEntity('32085984956', {
      apiKey: 'supersecret',
      fetchImpl: fail(403, { message: 'Forbidden' }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
    expect(JSON.stringify(result)).not.toContain('supersecret');
  });

  it('returns the full record — including the registered agent — from a bare object response', async () => {
    const body = {
      taxpayerNumber: '32085984956',
      taxpayerName: 'MIHAILA HOLDINGS CORP',
      registeredAgentName: 'ALEX J MIHAILA',
      registeredOfficeAddress: '797 CROWN JEWEL, BOERNE, TX 78006',
      stateOfFormation: 'IL',
      sosRegistrationStatus: 'ACTIVE',
      rightToTransact: 'ACTIVE',
    };
    const result = await getEntity('32085984956', { apiKey: 'k', fetchImpl: ok(body) });
    expect(result.ok).toBe(true);
    expect(result.entity.registeredAgentName).toBe('ALEX J MIHAILA');
    expect(result.entity.registeredOfficeAddress).toBe('797 CROWN JEWEL, BOERNE, TX 78006');
    expect(result.entity.taxpayerNumber).toBe('32085984956');
  });

  it('also accepts the record nested under data/result/entity wrapper keys', async () => {
    const row = { taxpayerNumber: '1', registeredAgentName: 'A' };
    for (const body of [{ data: row }, { result: row }, { entity: row }, { data: [row] }]) {
      const result = await getEntity('1', { apiKey: 'k', fetchImpl: ok(body) });
      expect(result.ok).toBe(true);
      expect(result.entity.registeredAgentName).toBe('A');
    }
  });

  it('treats an unrecognised shape as a failure, not a crash, and logs the raw body', async () => {
    const result = await getEntity('1', { apiKey: 'k', fetchImpl: ok([]) });
    expect(result.ok).toBe(false);
    expect(result.entity).toBeNull();
  });
});
