import { describe, it, expect } from 'vitest';
import { dedupeOfficers, normalizeOfficerName } from './mlsOfficers.js';

describe('dedupeOfficers', () => {
  it('keeps one contact per distinct name, joining titles for a repeat', () => {
    // Same shape as the Mihaila fixture in comptroller.test.js — one person,
    // two titles, from comptroller.js's own officerInfo dedupe (which keeps
    // exact name+title duplicates as distinct rows on purpose).
    const officers = [
      { name: 'ALEX J MIHAILA', title: 'DIRECTOR', address: '797 CROWN JEWEL, BOERNE, TX 78006' },
      { name: 'ALEX J MIHAILA', title: 'PRESIDENT', address: '797 CROWN JEWEL, BOERNE, TX 78006' },
    ];
    const result = dedupeOfficers(officers);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'ALEX J MIHAILA',
      title: 'DIRECTOR · PRESIDENT',
      address: '797 CROWN JEWEL, BOERNE, TX 78006',
    });
  });

  it('keeps genuinely distinct people as separate contacts', () => {
    // The motivating FANNIE MAE LLC lookup: three officer rows, three
    // distinctly-spelled names — none of them collapse into each other.
    const officers = [
      { name: 'JEFFREY A COULTAS', title: 'REGISTERED AGENT', address: '1 MAIN ST, SAN ANTONIO, TX 78201' },
      { name: 'JEFFREY COULTAS', title: 'MRG MBR', address: '' },
      { name: 'LAURA COULTAS', title: 'MBR', address: '' },
    ];
    const result = dedupeOfficers(officers);
    expect(result).toHaveLength(3);
    expect(result.map((o) => o.name)).toEqual(['JEFFREY A COULTAS', 'JEFFREY COULTAS', 'LAURA COULTAS']);
    expect(result.map((o) => o.title)).toEqual(['REGISTERED AGENT', 'MRG MBR', 'MBR']);
  });

  it('is case/whitespace-insensitive on the dedupe key but keeps the first-seen casing', () => {
    const officers = [
      { name: 'Jane Doe', title: 'MEMBER', address: '' },
      { name: '  jane   doe  ', title: 'MANAGER', address: '' },
    ];
    const result = dedupeOfficers(officers);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Jane Doe');
    expect(result[0].title).toBe('MEMBER · MANAGER');
  });

  it('drops a blank title rather than leaving a stray separator', () => {
    const result = dedupeOfficers([{ name: 'John Smith', title: '', address: '' }]);
    expect(result).toEqual([{ name: 'John Smith', title: '', address: '' }]);
  });

  it('fills in an address from a later row when an earlier one was blank', () => {
    const officers = [
      { name: 'John Smith', title: 'MEMBER', address: '' },
      { name: 'John Smith', title: 'MANAGER', address: '123 Elm St' },
    ];
    const result = dedupeOfficers(officers);
    expect(result[0].address).toBe('123 Elm St');
  });

  it('skips a row with no name rather than inventing a contact', () => {
    const result = dedupeOfficers([{ name: '', title: 'MEMBER', address: '' }, null, 'not an object']);
    expect(result).toEqual([]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(dedupeOfficers(undefined)).toEqual([]);
    expect(dedupeOfficers(null)).toEqual([]);
  });
});

describe('normalizeOfficerName', () => {
  it('collapses case and whitespace for a stable dedupe key', () => {
    expect(normalizeOfficerName('  Jane   Doe ')).toBe('JANE DOE');
  });

  it('never returns undefined for a missing name', () => {
    expect(normalizeOfficerName(null)).toBe('');
    expect(normalizeOfficerName(undefined)).toBe('');
  });
});
