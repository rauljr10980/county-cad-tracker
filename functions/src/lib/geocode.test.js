import { describe, it, expect } from 'vitest';
import { buildGeocodeQuery, parseGeocodeResponse } from './geocode.js';

describe('buildGeocodeQuery', () => {
  it('joins the full address into one searchable string', () => {
    expect(buildGeocodeQuery({ address: '1423 W GRAMERCY PL', city: 'SAN ANTONIO', state: 'TX', zip: '78201' }))
      .toBe('1423 W GRAMERCY PL, SAN ANTONIO, TX, 78201');
  });

  it('omits missing parts rather than leaving empty segments', () => {
    expect(buildGeocodeQuery({ address: '908 DONALDSON AVE', city: '', state: 'TX', zip: '' }))
      .toBe('908 DONALDSON AVE, TX');
  });

  it('returns null without a street, so a bare city never geocodes', () => {
    // A city/state-only query resolves to the middle of San Antonio, which
    // would drop a confident pin on a landlord whose address we do not have.
    expect(buildGeocodeQuery({ address: '', city: 'SAN ANTONIO', state: 'TX', zip: '78201' })).toBeNull();
    expect(buildGeocodeQuery({ address: '   ', city: 'SAN ANTONIO', state: 'TX' })).toBeNull();
    expect(buildGeocodeQuery({})).toBeNull();
  });

  it('trims stray whitespace from each part', () => {
    expect(buildGeocodeQuery({ address: '  123 MAIN ST ', city: ' SAN ANTONIO', state: 'TX ', zip: ' 78201' }))
      .toBe('123 MAIN ST, SAN ANTONIO, TX, 78201');
  });
});

describe('parseGeocodeResponse', () => {
  it('reads coordinates from the first result', () => {
    expect(parseGeocodeResponse([{ lat: '29.4241', lon: '-98.4936' }]))
      .toEqual({ latitude: 29.4241, longitude: -98.4936 });
  });

  it('treats an empty or malformed payload as unresolvable', () => {
    expect(parseGeocodeResponse([])).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse(undefined)).toBeNull();
    expect(parseGeocodeResponse({ lat: '29.4', lon: '-98.5' })).toBeNull();
  });

  it('rejects unparseable coordinates instead of storing NaN', () => {
    expect(parseGeocodeResponse([{ lat: 'not-a-number', lon: '-98.4936' }])).toBeNull();
    expect(parseGeocodeResponse([{ lat: '29.4241' }])).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    // A bad parse that lands outside the globe would drag the map's auto-fit
    // with it, so it is worth refusing explicitly.
    expect(parseGeocodeResponse([{ lat: '99.9', lon: '-98.4936' }])).toBeNull();
    expect(parseGeocodeResponse([{ lat: '29.4241', lon: '-200.1' }])).toBeNull();
  });
});
