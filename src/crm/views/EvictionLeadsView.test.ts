import { describe, it, expect } from 'vitest';
import { stageTone } from './EvictionLeadsView';
import { STAGES } from '@/crm-evictions/constants';

describe('stageTone', () => {
  it('returns a corporate pill modifier for every current stage', () => {
    const allowed = new Set(['', 'blue', 'warn', 'grey', 'danger']);
    for (const stage of STAGES) {
      expect(allowed.has(stageTone(stage))).toBe(true);
    }
  });

  it('marks dead-end stages as danger', () => {
    expect(stageTone('Not Interested')).toBe('danger');
    expect(stageTone('Do Not Contact')).toBe('danger');
  });

  it('marks the untouched stage as grey', () => {
    expect(stageTone('New Lead')).toBe('grey');
  });

  it('falls back to grey for unrecognized values', () => {
    expect(stageTone('Something Unmapped')).toBe('grey');
  });
});
