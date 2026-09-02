import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SOURCE_PAGES,
  isValidSourcePage,
  isHoneypotTriggered,
  hasContactMethod,
  hashIp,
  getIpHashSalt,
  DEFAULT_IP_HASH_SALT,
} from './publicIntake.js';

describe('SOURCE_PAGES / isValidSourcePage', () => {
  it('lists exactly the four known funnel pages', () => {
    expect(SOURCE_PAGES).toEqual(['sell-property', 'distressed-property', 'inherited-property', 'landlord-help']);
  });

  it('accepts each known page', () => {
    for (const page of SOURCE_PAGES) {
      expect(isValidSourcePage(page)).toBe(true);
    }
  });

  it('rejects an arbitrary string rather than storing it', () => {
    expect(isValidSourcePage('some-other-page')).toBe(false);
    expect(isValidSourcePage('<script>alert(1)</script>')).toBe(false);
  });

  it('rejects missing, empty, and non-string input', () => {
    expect(isValidSourcePage(undefined)).toBe(false);
    expect(isValidSourcePage(null)).toBe(false);
    expect(isValidSourcePage('')).toBe(false);
    expect(isValidSourcePage(123)).toBe(false);
  });

  it('is case-sensitive — a near-miss casing does not sneak through', () => {
    expect(isValidSourcePage('Sell-Property')).toBe(false);
    expect(isValidSourcePage('SELL-PROPERTY')).toBe(false);
  });
});

describe('isHoneypotTriggered', () => {
  it('is false when the honeypot field is empty, undefined, or missing', () => {
    expect(isHoneypotTriggered('')).toBe(false);
    expect(isHoneypotTriggered(undefined)).toBe(false);
    expect(isHoneypotTriggered(null)).toBe(false);
  });

  it('is false for whitespace only after trimming', () => {
    expect(isHoneypotTriggered('   ')).toBe(false);
  });

  it('is true when a bot fills in any value', () => {
    expect(isHoneypotTriggered('http://spam.example')).toBe(true);
    expect(isHoneypotTriggered('x')).toBe(true);
  });
});

describe('hasContactMethod', () => {
  it('is false when both email and phone are absent', () => {
    expect(hasContactMethod({})).toBe(false);
    expect(hasContactMethod({ email: '', phone: '' })).toBe(false);
    expect(hasContactMethod(undefined)).toBe(false);
  });

  it('is false when both are whitespace only', () => {
    expect(hasContactMethod({ email: '   ', phone: '  ' })).toBe(false);
  });

  it('is true with only an email', () => {
    expect(hasContactMethod({ email: 'a@example.com', phone: '' })).toBe(true);
  });

  it('is true with only a phone', () => {
    expect(hasContactMethod({ email: '', phone: '210-555-0100' })).toBe(true);
  });

  it('is true with both', () => {
    expect(hasContactMethod({ email: 'a@example.com', phone: '210-555-0100' })).toBe(true);
  });
});

describe('hashIp', () => {
  it('is deterministic — same IP and salt produce the same hash', () => {
    expect(hashIp('1.2.3.4', 'salt-a')).toBe(hashIp('1.2.3.4', 'salt-a'));
  });

  it('different salts produce different hashes for the same IP', () => {
    expect(hashIp('1.2.3.4', 'salt-a')).not.toBe(hashIp('1.2.3.4', 'salt-b'));
  });

  it('different IPs produce different hashes under the same salt', () => {
    expect(hashIp('1.2.3.4', 'salt-a')).not.toBe(hashIp('5.6.7.8', 'salt-a'));
  });

  it('the raw IP never appears in the output', () => {
    const ip = '203.0.113.42';
    const hash = hashIp(ip, 'some-salt');
    expect(hash).not.toContain(ip);
    expect(hash).not.toContain('203');
    expect(hash).not.toContain('113');
  });

  it('produces a fixed-length hex digest (sha256)', () => {
    expect(hashIp('1.2.3.4', 'salt-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles a missing/undefined IP without throwing', () => {
    expect(() => hashIp(undefined, 'salt-a')).not.toThrow();
    expect(hashIp(undefined, 'salt-a')).toBe(hashIp(undefined, 'salt-a'));
  });
});

describe('getIpHashSalt / hashIp fallback behavior', () => {
  const originalSalt = process.env.IP_HASH_SALT;

  afterEach(() => {
    if (originalSalt === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = originalSalt;
  });

  it('uses IP_HASH_SALT from the environment when set', () => {
    process.env.IP_HASH_SALT = 'env-salt-123';
    expect(getIpHashSalt()).toBe('env-salt-123');
  });

  it('falls back to the constant default salt when unset', () => {
    delete process.env.IP_HASH_SALT;
    expect(getIpHashSalt()).toBe(DEFAULT_IP_HASH_SALT);
  });

  it('hashIp picks up the configured env salt by default', () => {
    process.env.IP_HASH_SALT = 'env-salt-456';
    expect(hashIp('9.9.9.9')).toBe(hashIp('9.9.9.9', 'env-salt-456'));
  });
});
