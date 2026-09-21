import { describe, it, expect, afterEach } from 'vitest';
import { getAuthHeaders, getViewAsUserId, VIEW_AS_STORAGE_KEY } from './api';

afterEach(() => {
  localStorage.clear();
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
