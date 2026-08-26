import { describe, it, expect } from 'vitest';
import { QUEUES, lastContactLabel, followUpLabel } from './queues';

const now = new Date('2026-08-25T12:00:00Z');

describe('QUEUES', () => {
  it('lists the seven queues in display order', () => {
    expect(QUEUES.map((q) => q.id)).toEqual([
      'all', 'needsContact', 'overdue', 'dueToday', 'upcoming', 'parked', 'closed',
    ]);
  });

  it('labels them for the tab strip', () => {
    expect(QUEUES.map((q) => q.label)).toEqual([
      'All', 'Needs contact', 'Overdue', 'Due today', 'Upcoming', 'Parked', 'Closed',
    ]);
  });
});

describe('lastContactLabel', () => {
  it('states the absence rather than leaving a blank', () => {
    expect(lastContactLabel(null, now)).toBe('Never');
    expect(lastContactLabel(undefined, now)).toBe('Never');
  });

  it('counts whole days back', () => {
    expect(lastContactLabel('2026-08-25T09:00:00Z', now)).toBe('Today');
    expect(lastContactLabel('2026-08-24T09:00:00Z', now)).toBe('1d ago');
    expect(lastContactLabel('2026-08-11T09:00:00Z', now)).toBe('14d ago');
  });
});

describe('followUpLabel', () => {
  it('renders nothing scheduled as an em dash', () => {
    expect(followUpLabel(null, now)).toBe('—');
  });

  it('renders overdue as elapsed days, not a date', () => {
    expect(followUpLabel('2026-08-11T09:00:00Z', now)).toBe('14d overdue');
    expect(followUpLabel('2026-08-24T09:00:00Z', now)).toBe('1d overdue');
  });

  it('names today rather than counting zero days', () => {
    expect(followUpLabel('2026-08-25T18:00:00Z', now)).toBe('Today');
  });

  it('renders upcoming as days ahead', () => {
    expect(followUpLabel('2026-08-28T09:00:00Z', now)).toBe('in 3d');
  });

  it('compares whole UTC days, so a late-evening follow-up today is not overdue', () => {
    expect(followUpLabel('2026-08-25T00:30:00Z', now)).toBe('Today');
  });

  it('treats a 60-minute gap across midnight UTC as a full day', () => {
    const minuteBeforeMidnight = new Date('2026-08-24T23:30:00Z');
    const minuteAfterMidnight = new Date('2026-08-25T00:30:00Z');
    expect(followUpLabel(minuteBeforeMidnight.toISOString(), minuteAfterMidnight)).toBe('1d overdue');
  });

  it('renders undefined scheduled as an em dash', () => {
    expect(followUpLabel(undefined, now)).toBe('—');
  });
});
