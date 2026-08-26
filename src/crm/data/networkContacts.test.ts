import { describe, it, expect } from 'vitest';
import {
  networkLeadId,
  buildNetworkState,
  buildNetworkStateFromRecords,
  mergeNetworkState,
  type NetworkContactRecord,
} from './networkContacts';
import { EMPTY_STATE, type CrmState } from './types';

const now = new Date('2026-08-25T12:00:00Z');

const record: NetworkContactRecord = {
  category: 'Brokers',
  name: 'Larry Mendez',
  city: 'San Antonio',
  company: 'CBRE',
  email: '',
  phone: '',
  asset: 'Office',
  specialization: 'Tenant Rep',
  notes: 'get coffee',
  metPersonally: '',
};

const records: NetworkContactRecord[] = [
  record,
  {
    category: 'Developers',
    name: 'Gene Williams',
    city: 'San Antonio',
    company: 'Oxbow',
    email: '',
    phone: '',
    asset: '',
    specialization: '',
    notes: 'text him',
    metPersonally: '',
  },
];

const allIds = (state: CrmState): string[] => [
  ...state.leads.map((l) => l.id),
  ...state.deals.map((d) => d.id),
  ...state.tasks.map((t) => t.id),
  ...state.activities.map((a) => a.id),
];

describe('networkContacts id namespacing', () => {
  it('networkLeadId produces different ids for different owner keys on the same record', () => {
    const idA = networkLeadId(record, 'user-a');
    const idB = networkLeadId(record, 'user-b');
    expect(idA).not.toBe(idB);
    expect(idA.startsWith('network-')).toBe(true);
    expect(idB.startsWith('network-')).toBe(true);
  });

  it('networkLeadId is stable across calls for the same owner key', () => {
    const first = networkLeadId(record, 'user-a');
    const second = networkLeadId(record, 'user-a');
    expect(first).toBe(second);
  });

  it('two different owner keys produce fully disjoint id sets across leads, deals, tasks, and activities', () => {
    const stateA = buildNetworkStateFromRecords(records, now, 'user-a');
    const stateB = buildNetworkStateFromRecords(records, now, 'user-b');

    const idsA = new Set(allIds(stateA));
    const idsB = new Set(allIds(stateB));

    expect(idsA.size).toBeGreaterThan(0);
    expect(idsB.size).toBeGreaterThan(0);
    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false);
    }
  });

  it('the same owner key produces a stable, identical id set across separate calls', () => {
    const first = buildNetworkStateFromRecords(records, now, 'user-a');
    const second = buildNetworkStateFromRecords(records, now, 'user-a');

    expect(allIds(second)).toEqual(allIds(first));
  });

  it('buildNetworkState namespaces the full seeded contact set under the owner key', () => {
    const state = buildNetworkState(now, 'user-a');
    const ids = allIds(state);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('network-user-a-'))).toBe(true);
  });

  it('mergeNetworkState does not inject any network contacts when no owner key is given', () => {
    const merged = mergeNetworkState(EMPTY_STATE, now);
    expect(merged).toBe(EMPTY_STATE);
    expect(merged.leads).toEqual([]);
  });

  it('mergeNetworkState injects namespaced network contacts once an owner key is given', () => {
    const merged = mergeNetworkState(EMPTY_STATE, now, 'user-a');
    expect(merged.leads.length).toBeGreaterThan(0);
    expect(merged.leads.every((lead) => lead.id.startsWith('network-user-a-'))).toBe(true);
  });
});
