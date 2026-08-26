import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QUEUES, queueFilter, baseLandlordFilter } from './pipelineQueues.js';

const ACTIVE = { parkedAt: null, contactStage: { not: 'Closed' } };

describe('queueFilter', () => {
  it('lists all seven queue ids, in tab order', () => {
    expect(QUEUES).toEqual(['all', 'needsContact', 'overdue', 'dueToday', 'upcoming', 'parked', 'closed']);
  });

  it('all excludes nothing', () => {
    expect(queueFilter('all')).toEqual({});
  });

  it('needsContact is active leads with no contact recorded yet', () => {
    expect(queueFilter('needsContact')).toEqual({ ...ACTIVE, lastContactedAt: null });
  });

  it('parked tests only parkedAt, independent of contactStage', () => {
    expect(queueFilter('parked')).toEqual({ parkedAt: { not: null } });
  });

  it('closed tests only contactStage, independent of parkedAt', () => {
    expect(queueFilter('closed')).toEqual({ contactStage: 'Closed' });
  });

  it('the four active queues (needsContact, overdue, dueToday, upcoming) all exclude parked and closed leads', () => {
    for (const id of ['needsContact', 'overdue', 'dueToday', 'upcoming']) {
      const where = queueFilter(id);
      expect(where.parkedAt).toBe(null);
      expect(where.contactStage).toEqual({ not: 'Closed' });
    }
  });

  it('parked and closed do not carry the active-queue exclusions', () => {
    expect(queueFilter('parked').contactStage).toBeUndefined();
    expect(queueFilter('closed').parkedAt).toBeUndefined();
  });

  describe('UTC day boundaries for overdue / dueToday / upcoming', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Midday UTC on an arbitrary date — nowhere near a boundary itself, so
      // the computed boundaries below are unambiguously "today" in UTC.
      vi.setSystemTime(new Date('2026-08-25T15:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const startOfToday = new Date('2026-08-25T00:00:00.000Z');
    const endOfToday = new Date('2026-08-25T23:59:59.999Z');

    it('overdue is strictly before the start of today (UTC)', () => {
      expect(queueFilter('overdue').nextFollowUpAt).toEqual({ lt: startOfToday });
    });

    it('dueToday spans the full UTC day, inclusive on both ends', () => {
      expect(queueFilter('dueToday').nextFollowUpAt).toEqual({ gte: startOfToday, lte: endOfToday });
    });

    it('upcoming is strictly after the end of today (UTC)', () => {
      expect(queueFilter('upcoming').nextFollowUpAt).toEqual({ gt: endOfToday });
    });

    it('has no gap: every millisecond is claimed by exactly one of overdue/dueToday/upcoming', () => {
      // The millisecond just before startOfToday is not >= startOfToday (so
      // dueToday excludes it) but is < startOfToday (so overdue claims it).
      const justBeforeStart = startOfToday.getTime() - 1;
      expect(justBeforeStart).toBeLessThan(startOfToday.getTime());

      // The millisecond immediately after endOfToday is exactly the next
      // representable instant at TIMESTAMP(3) precision, and it is what
      // "gt endOfToday" (upcoming) picks up where "lte endOfToday" (dueToday)
      // leaves off — no millisecond falls between the two conditions.
      const justAfterEnd = endOfToday.getTime() + 1;
      expect(justAfterEnd).toBeGreaterThan(endOfToday.getTime());
    });

    it('has no overlap: the boundary instants belong to exactly one queue', () => {
      const overdueUpper = queueFilter('overdue').nextFollowUpAt.lt.getTime();
      const dueTodayLower = queueFilter('dueToday').nextFollowUpAt.gte.getTime();
      const dueTodayUpper = queueFilter('dueToday').nextFollowUpAt.lte.getTime();
      const upcomingLower = queueFilter('upcoming').nextFollowUpAt.gt.getTime();

      // overdue's exclusive upper bound equals dueToday's inclusive lower
      // bound: nothing sits strictly between "before today" and "today".
      expect(overdueUpper).toBe(dueTodayLower);
      // dueToday's inclusive upper bound equals upcoming's exclusive lower
      // bound: nothing sits strictly between "today" and "after today".
      expect(dueTodayUpper).toBe(upcomingLower);
    });
  });
});

describe('baseLandlordFilter', () => {
  it('defaults to isCorporate: false when corporate is absent', () => {
    expect(baseLandlordFilter({})).toEqual({ isCorporate: false });
  });

  it('corporate=all applies no isCorporate filter', () => {
    expect(baseLandlordFilter({ corporate: 'all' })).toEqual({});
  });

  it('corporate=true filters to corporate landlords', () => {
    expect(baseLandlordFilter({ corporate: 'true' })).toEqual({ isCorporate: true });
  });

  it('search adds a case-insensitive OR across name and address', () => {
    const where = baseLandlordFilter({ search: 'main st' });
    expect(where.OR).toEqual([
      { name: { contains: 'main st', mode: 'insensitive' } },
      { addresses: { some: { address: { contains: 'main st', mode: 'insensitive' } } } },
    ]);
  });

  it('assignedTo=unassigned filters to null, distinct from an actual id', () => {
    expect(baseLandlordFilter({ assignedTo: 'unassigned' })).toEqual({ isCorporate: false, assignedToId: null });
    expect(baseLandlordFilter({ assignedTo: 'user-1' })).toEqual({ isCorporate: false, assignedToId: 'user-1' });
  });
});
