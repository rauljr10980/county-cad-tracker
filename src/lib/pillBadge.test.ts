import { describe, it, expect } from 'vitest';
import { pillClass } from './pillBadge';

describe('pillClass', () => {
  it('returns the pill-shaped base classes for every known tone', () => {
    for (const tone of ['grey', 'blue', 'warn', 'danger', 'success']) {
      expect(pillClass(tone)).toContain('rounded-full');
      expect(pillClass(tone)).toContain('inline-flex');
    }
  });

  it('maps each tone to its own background/text classes', () => {
    expect(pillClass('grey')).toBe('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground');
    expect(pillClass('blue')).toContain('bg-primary/15 text-primary');
    expect(pillClass('warn')).toContain('bg-warning/15 text-warning');
    expect(pillClass('danger')).toContain('bg-destructive/15 text-destructive');
    expect(pillClass('success')).toContain('bg-success/15 text-success');
  });

  it('falls back to the grey tone for an unrecognized or empty tone', () => {
    expect(pillClass('')).toBe(pillClass('grey'));
    expect(pillClass('nonsense')).toBe(pillClass('grey'));
  });
});
