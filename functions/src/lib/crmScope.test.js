import { describe, it, expect } from 'vitest';
import {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
} from './crmScope.js';

describe('scope builders', () => {
  it('scopes leads by their owner', () => {
    expect(leadWhere('u1')).toEqual({ userId: 'u1' });
  });

  it('scopes children through the lead relation, not a column of their own', () => {
    expect(childWhere('u1')).toEqual({ lead: { userId: 'u1' } });
  });

  it('keeps the incoming ids and deletes the rest, within one owner', () => {
    expect(leadDeleteWhere('u1', ['a', 'b'])).toEqual({
      userId: 'u1',
      id: { notIn: ['a', 'b'] },
    });
  });

  it('scopes child deletes through the relation', () => {
    expect(childDeleteWhere('u1', ['a'])).toEqual({
      lead: { userId: 'u1' },
      id: { notIn: ['a'] },
    });
  });

  it('deletes nothing outside the owner even when the keep list is empty', () => {
    expect(leadDeleteWhere('u1', [])).toEqual({ userId: 'u1', id: { notIn: [] } });
    expect(childDeleteWhere('u1', [])).toEqual({
      lead: { userId: 'u1' },
      id: { notIn: [] },
    });
  });
});

describe('isEmptyPayloadBlocked', () => {
  it('blocks an empty payload when the account has leads', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 0, existingLeads: 12 })).toBe(true);
  });

  it('allows an empty payload when the account has no leads', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 0, existingLeads: 0 })).toBe(false);
  });

  it('allows a payload that legitimately removes some leads', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 3, existingLeads: 12 })).toBe(false);
  });

  it('allows a payload that removes all but one lead', () => {
    expect(isEmptyPayloadBlocked({ incomingLeads: 1, existingLeads: 12 })).toBe(false);
  });

  it('triggers on lead count alone, ignoring empty child collections', () => {
    expect(
      isEmptyPayloadBlocked({
        incomingLeads: 2,
        existingLeads: 9,
        incomingDeals: 0,
        incomingTasks: 0,
        incomingActivities: 0,
      })
    ).toBe(false);
  });
});

describe('error codes', () => {
  it('exposes stable codes the route maps to HTTP status', () => {
    expect(EMPTY_PAYLOAD_CODE).toBe('EMPTY_PAYLOAD_GUARD');
    expect(FOREIGN_ID_CODE).toBe('FOREIGN_ID');
  });
});
