import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAuthHeaders, getViewAsUserId, VIEW_AS_STORAGE_KEY } from './api';

function stubLocalStorage() {
  const store: Record<string, string> = {};

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach(key => delete store[key]);
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    length: 0,
  });
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getViewAsUserId', () => {
  it('returns null when nothing is stored', () => {
    expect(getViewAsUserId()).toBeNull();
  });

  it('returns the stored id', () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1');
    expect(getViewAsUserId()).toBe('teammate-1');
  });
});

describe('getAuthHeaders', () => {
  it('omits the view-as header entirely when no teammate is selected', () => {
    localStorage.setItem('authToken', 't0ken');
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t0ken');
    expect('X-View-As-User' in headers).toBe(false);
  });

  it('attaches the view-as header when a teammate is selected', () => {
    localStorage.setItem('authToken', 't0ken');
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1');
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers['X-View-As-User']).toBe('teammate-1');
  });

  it('still attaches the view-as header when there is no auth token', () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1');
    const headers = getAuthHeaders() as Record<string, string>;
    expect(headers['X-View-As-User']).toBe('teammate-1');
  });
});
