import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readGrant, writeGrant, clearGrant, GRANT_TTL_MS } from './useCrmGrant';

describe('CRM grant storage', () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is absent before anything is written', () => {
    expect(readGrant()).toBe(false);
  });

  it('is present immediately after being written', () => {
    writeGrant();
    expect(readGrant()).toBe(true);
  });

  it('expires once the TTL has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'));
    writeGrant();
    vi.setSystemTime(new Date(Date.now() + GRANT_TTL_MS + 1000));
    expect(readGrant()).toBe(false);
  });

  it('is cleared by revoke', () => {
    writeGrant();
    clearGrant();
    expect(readGrant()).toBe(false);
  });

  it('treats a corrupt stored value as no grant', () => {
    sessionStorage.setItem('evictionsCrmGrant', 'not-a-number');
    expect(readGrant()).toBe(false);
  });

  it('fails closed when sessionStorage throws on read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      expect(readGrant()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
