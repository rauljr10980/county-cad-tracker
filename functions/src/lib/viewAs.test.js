import { describe, it, expect } from 'vitest';
import { decideEffectiveUserId, FORBIDDEN_VIEW_AS_CODE } from './viewAs.js';

const admin = { id: 'mgr1', role: 'ADMIN' };
const operator = { id: 'op1', role: 'OPERATOR' };

describe('decideEffectiveUserId', () => {
  it('acts as the caller when no header is sent', () => {
    expect(decideEffectiveUserId(admin, undefined)).toBe('mgr1');
    expect(decideEffectiveUserId(operator, undefined)).toBe('op1');
  });

  it('acts as the caller when the header names the caller', () => {
    expect(decideEffectiveUserId(admin, 'mgr1')).toBe('mgr1');
  });

  it('ignores a non-string header rather than trusting it', () => {
    expect(decideEffectiveUserId(admin, ['a', 'b'])).toBe('mgr1');
    expect(decideEffectiveUserId(admin, '')).toBe('mgr1');
  });

  it('lets a Manager act as another account', () => {
    expect(decideEffectiveUserId(admin, 'op1')).toBe('op1');
  });

  it('refuses a non-Manager asking for another account', () => {
    expect(() => decideEffectiveUserId(operator, 'mgr1')).toThrowError(
      /only a manager/i
    );
  });

  it('tags the refusal with a stable code the middleware maps to 403', () => {
    try {
      decideEffectiveUserId(operator, 'mgr1');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe(FORBIDDEN_VIEW_AS_CODE);
    }
  });

  it('exposes a stable code string', () => {
    expect(FORBIDDEN_VIEW_AS_CODE).toBe('FORBIDDEN_VIEW_AS');
  });
});
