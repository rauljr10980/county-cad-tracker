import { describe, it, expect } from 'vitest';
import { truePeopleSearchUrl, taxAssessorUrl, landRecordsUrl } from './researchLinks';

const addr = { address: '5726 Golf Heights', city: 'San Antonio', state: 'TX', zip: '78244' };

describe('truePeopleSearchUrl', () => {
  it('searches by address, not by name', () => {
    const url = new URL(truePeopleSearchUrl(addr));
    expect(url.pathname).toBe('/resultaddress');
    expect(url.searchParams.get('name')).toBeNull();
  });

  it('puts the street line in streetaddress and only the locality in citystatezip', () => {
    const url = new URL(truePeopleSearchUrl(addr));
    expect(url.searchParams.get('streetaddress')).toBe('5726 Golf Heights');
    expect(url.searchParams.get('citystatezip')).toBe('San Antonio, TX 78244');
  });

  it('does not leak the street line into citystatezip', () => {
    const citystatezip = new URL(truePeopleSearchUrl(addr)).searchParams.get('citystatezip') ?? '';
    expect(citystatezip).not.toContain('5726');
    expect(citystatezip).not.toContain('Golf Heights');
  });

  it('omits an empty locality rather than sending stray punctuation', () => {
    const url = new URL(truePeopleSearchUrl({ address: '1 Main', city: '', state: '', zip: '' }));
    expect(url.searchParams.get('citystatezip')).toBe('');
  });
});

describe('taxAssessorUrl', () => {
  it('points at the Bexar tax assessor', () => {
    expect(taxAssessorUrl()).toContain('bexar.acttax.com');
  });
});

describe('landRecordsUrl', () => {
  it('searches Bexar public records for the street', () => {
    const url = new URL(landRecordsUrl(addr));
    expect(url.hostname).toBe('bexar.tx.publicsearch.us');
    expect(url.searchParams.get('searchValue')).toBe('5726 Golf Heights');
  });

  it('computes the end of the date range a year past the given date, instead of a fixed expiring bound', () => {
    const url = new URL(landRecordsUrl(addr, new Date('2026-08-26T00:00:00Z')));
    expect(url.searchParams.get('recordedDateRange')).toBe('18000101,20270826');
  });

  it('stays a year ahead of today, so the range never goes stale', () => {
    const inTenMonths = new Date();
    inTenMonths.setMonth(inTenMonths.getMonth() + 10);
    const url = new URL(landRecordsUrl(addr));
    const end = url.searchParams.get('recordedDateRange')?.split(',')[1] ?? '';
    const endDate = new Date(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`);
    expect(endDate.getTime()).toBeGreaterThan(inTenMonths.getTime());
  });
});
