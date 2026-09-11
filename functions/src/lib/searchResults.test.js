import { describe, it, expect } from 'vitest';
import {
  MIN_QUERY_LENGTH,
  isQueryTooShort,
  mapPropertyResult,
  mapPreForeclosureResult,
  mapCrmLeadResult,
  mapMlsLeadResult,
} from './searchResults.js';

describe('isQueryTooShort', () => {
  it('is true for undefined, empty, whitespace-only, and 1-character queries', () => {
    expect(isQueryTooShort(undefined)).toBe(true);
    expect(isQueryTooShort('')).toBe(true);
    expect(isQueryTooShort('  ')).toBe(true);
    expect(isQueryTooShort('a')).toBe(true);
  });

  it('is false at and above MIN_QUERY_LENGTH', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(isQueryTooShort('ab')).toBe(false);
    expect(isQueryTooShort('abc')).toBe(false);
  });
});

describe('result mappers', () => {
  it('maps a property row', () => {
    expect(mapPropertyResult({ id: 'p1', propertyAddress: '123 Main St', ownerName: 'Jane Doe' })).toEqual({
      type: 'property', id: 'p1', label: '123 Main St', sublabel: 'Jane Doe', tab: 'properties',
    });
  });

  it('falls back to ownerName as the label when propertyAddress is blank', () => {
    expect(mapPropertyResult({ id: 'p2', propertyAddress: '', ownerName: 'Jane Doe' }).label).toBe('Jane Doe');
  });

  it('maps a pre-foreclosure row', () => {
    expect(mapPreForeclosureResult({ id: 'f1', address: '456 Oak Ave', city: 'San Antonio' })).toEqual({
      type: 'preforeclosure', id: 'f1', label: '456 Oak Ave', sublabel: 'San Antonio', tab: 'preforeclosure',
    });
  });

  it('maps a CRM lead row, preferring ownerName then businessName, phone then email', () => {
    expect(mapCrmLeadResult({ id: 'c1', ownerName: 'Sam Lee', businessName: '', phone: '2105551212', email: '' })).toEqual({
      type: 'crmLead', id: 'c1', label: 'Sam Lee', sublabel: '2105551212', tab: 'crm',
    });
    expect(mapCrmLeadResult({ id: 'c2', ownerName: '', businessName: 'Acme LLC', phone: '', email: 'a@b.com' })).toEqual({
      type: 'crmLead', id: 'c2', label: 'Acme LLC', sublabel: 'a@b.com', tab: 'crm',
    });
  });

  it('maps an MLS lead row', () => {
    expect(mapMlsLeadResult({ id: 'm1', address: '789 Elm St', status: 'ACT' })).toEqual({
      type: 'mlsLead', id: 'm1', label: '789 Elm St', sublabel: 'ACT', tab: 'mls',
    });
  });
});
