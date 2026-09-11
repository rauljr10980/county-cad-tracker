import { describe, it, expect } from 'vitest';
import { mapFollowUpNotification, mapInboxNotification, sortByTimestampDesc } from './notificationFeed.js';

describe('mapFollowUpNotification', () => {
  it('uses the property address and "properties" tab when propertyId is set', () => {
    const result = mapFollowUpNotification({
      id: 'f1', propertyId: 'p1', preforeclosureId: null, date: '2026-09-11T00:00:00.000Z',
      property: { propertyAddress: '123 Main St' }, preForeclosure: null, drivingLead: null,
    });
    expect(result).toEqual({ type: 'followup', id: 'f1', message: 'Follow-up due: 123 Main St', timestamp: '2026-09-11T00:00:00.000Z', tab: 'properties' });
  });

  it('uses the pre-foreclosure address and "preforeclosure" tab when preforeclosureId is set', () => {
    const result = mapFollowUpNotification({
      id: 'f2', propertyId: null, preforeclosureId: 'pf1', date: '2026-09-11T00:00:00.000Z',
      property: null, preForeclosure: { address: '456 Oak Ave' }, drivingLead: null,
    });
    expect(result).toEqual({ type: 'followup', id: 'f2', message: 'Follow-up due: 456 Oak Ave', timestamp: '2026-09-11T00:00:00.000Z', tab: 'preforeclosure' });
  });

  it('falls back to the driving lead rawAddress and "driving" tab otherwise', () => {
    const result = mapFollowUpNotification({
      id: 'f3', propertyId: null, preforeclosureId: null, date: '2026-09-11T00:00:00.000Z',
      property: null, preForeclosure: null, drivingLead: { rawAddress: '789 Elm St' },
    });
    expect(result).toEqual({ type: 'followup', id: 'f3', message: 'Follow-up due: 789 Elm St', timestamp: '2026-09-11T00:00:00.000Z', tab: 'driving' });
  });

  it('falls back to a generic message when no relation resolved to an address', () => {
    const result = mapFollowUpNotification({
      id: 'f4', propertyId: null, preforeclosureId: null, date: '2026-09-11T00:00:00.000Z',
      property: null, preForeclosure: null, drivingLead: null,
    });
    expect(result.message).toBe('Follow-up due: a lead');
  });
});

describe('mapInboxNotification', () => {
  it('includes the submitter name', () => {
    expect(mapInboxNotification({ id: 's1', name: 'Pat Smith', createdAt: '2026-09-10T00:00:00.000Z' })).toEqual({
      type: 'inbox', id: 's1', message: 'New inquiry from Pat Smith', timestamp: '2026-09-10T00:00:00.000Z', tab: 'inbox',
    });
  });

  it('falls back to a generic label when name is blank', () => {
    expect(mapInboxNotification({ id: 's2', name: '', createdAt: '2026-09-10T00:00:00.000Z' }).message).toBe('New inquiry from a visitor');
  });
});

describe('sortByTimestampDesc', () => {
  it('orders newest first', () => {
    const items = [
      { id: 'a', timestamp: '2026-09-10T00:00:00.000Z' },
      { id: 'b', timestamp: '2026-09-11T00:00:00.000Z' },
      { id: 'c', timestamp: '2026-09-09T00:00:00.000Z' },
    ];
    expect(sortByTimestampDesc(items).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate its input array', () => {
    const items = [{ id: 'a', timestamp: '2026-09-10T00:00:00.000Z' }, { id: 'b', timestamp: '2026-09-11T00:00:00.000Z' }];
    const original = [...items];
    sortByTimestampDesc(items);
    expect(items).toEqual(original);
  });
});
