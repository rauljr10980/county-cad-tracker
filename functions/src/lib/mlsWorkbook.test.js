import { describe, it, expect } from 'vitest';
import { parseSheet, dedupe, MLS_COLUMNS } from './mlsWorkbook.js';

const row = {
  'MLS#': 1853544, Status: 'SLD', Area: 1700, Address: '804  Station',
  'LP/SP': 530000, DOM: 149, 'Ttl Units': 4, SqFt: 4352, 'Yr Blt': 1985,
  Type: '2STRY', 'Bldr Name': 'Unknown', Constrctn: '', County: 'Bexar',
  'CountAct#': null, 'County Tax': '', 'Legal Desc': 'Cb 5063J Blk 1',
  'LglDsc-Lot': 'NE 78', 'List Agent': 'Ayhan Oruc', 'List Agent Ph.': '(210) 287-7246',
  Owner: 'Baabco Properties II LLC', 'LREA/LREB': 'No', 'Selling Agent': 'Tatyana Sutton',
  'Selling Agent Ph.': '(210) 980-6136', State: 'Texas', Dir: '', 'Street Name': 'Station',
  'Str #': 804, TaxPropID: null, Zip: 78109, ZipPlus: null,
};

describe('MLS_COLUMNS', () => {
  it('names all 30 source columns', () => {
    expect(MLS_COLUMNS).toHaveLength(30);
    expect(MLS_COLUMNS).toContain('MLS#');
    expect(MLS_COLUMNS).toContain('ZipPlus');
  });
});

describe('parseSheet', () => {
  it('maps every column onto the model', () => {
    const [lead] = parseSheet([row]);
    expect(lead.mlsNumber).toBe('1853544');
    expect(lead.status).toBe('SLD');
    expect(lead.county).toBe('Bexar');
    expect(lead.price).toBe(530000);
    expect(lead.totalUnits).toBe(4);
    expect(lead.zip).toBe('78109');
    expect(lead.mlsOwnerRaw).toBe('Baabco Properties II LLC');
    expect(lead.listAgent).toBe('Ayhan Oruc');
    expect(lead.legalLot).toBe('NE 78');
  });

  it('tolerates the nulls that appear in real exports', () => {
    const [lead] = parseSheet([row]);
    expect(lead.countyAccountNumber).toBe('');
    expect(lead.taxPropId).toBe('');
    expect(lead.zipPlus).toBe('');
  });

  it('collapses the double space in the address', () => {
    expect(parseSheet([row])[0].address).toBe('804 Station');
  });

  it('skips a row with no MLS number rather than importing a ghost', () => {
    expect(parseSheet([{ ...row, 'MLS#': null }])).toHaveLength(0);
  });
});

describe('dedupe', () => {
  it('keeps the first occurrence of a repeated MLS number', () => {
    const a = { mlsNumber: '1', status: 'ACT' };
    const b = { mlsNumber: '1', status: 'SLD' };
    const c = { mlsNumber: '2', status: 'EXP' };
    const result = dedupe([a, b, c]);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('ACT');
  });

  it('returns an empty array unchanged', () => {
    expect(dedupe([])).toEqual([]);
  });
});
