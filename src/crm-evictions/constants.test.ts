import { describe, it, expect } from 'vitest';
import { STAGES, mapLegacyStage } from './constants';

describe('STAGES', () => {
  it('has the 12 stages in pipeline order', () => {
    expect(STAGES).toEqual([
      'New Lead', 'Researching', 'Ready to Contact', 'Attempted Contact',
      'Contacted', 'Follow-Up', 'Appointment Scheduled', 'Interested',
      'Not Interested', 'Under Contract', 'Closed', 'Do Not Contact',
    ]);
  });
});

describe('mapLegacyStage', () => {
  it('maps every legacy value to a current stage', () => {
    expect(mapLegacyStage('New')).toBe('New Lead');
    expect(mapLegacyStage('Researching')).toBe('Researching');
    expect(mapLegacyStage('Contacted')).toBe('Contacted');
    expect(mapLegacyStage('Follow Up')).toBe('Follow-Up');
    expect(mapLegacyStage('Qualified')).toBe('Interested');
    expect(mapLegacyStage('Not Interested')).toBe('Not Interested');
    expect(mapLegacyStage('Do Not Call')).toBe('Do Not Contact');
  });

  it('produces only values that exist in STAGES', () => {
    const legacy = ['New', 'Researching', 'Contacted', 'Follow Up', 'Qualified', 'Not Interested', 'Do Not Call'];
    for (const value of legacy) {
      expect(STAGES).toContain(mapLegacyStage(value));
    }
  });

  it('passes unknown values through untouched rather than coercing them', () => {
    expect(mapLegacyStage('Something Else')).toBe('Something Else');
    expect(mapLegacyStage('')).toBe('');
  });

  it('leaves already-migrated values alone', () => {
    for (const stage of STAGES) {
      expect(mapLegacyStage(stage)).toBe(stage);
    }
  });
});
