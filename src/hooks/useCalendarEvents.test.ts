import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCalendarEvents } from './useCalendarEvents';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'raul' } }),
}));

vi.mock('@/hooks/useFollowUps', () => ({
  useFollowUps: () => ({
    data: [
      { id: 'fu1', date: '2026-09-15T00:00:00.000Z', completed: false, drivingLeadId: null },
    ],
  }),
}));

vi.mock('@/hooks/useDrivingLeads', () => ({
  useDrivingLeads: () => ({ data: [] }),
}));

vi.mock('@/crm/store/useCrmStore', () => ({
  useCrmStore: (selector: (s: any) => unknown) =>
    selector({ hydrate: vi.fn(), tasks: [], leads: [] }),
}));

describe('useCalendarEvents', () => {
  it('builds a followup-kind event from useFollowUps data', () => {
    const { result } = renderHook(() => useCalendarEvents('2026-09'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ id: 'fu1', kind: 'followup', allDay: true, completed: false });
  });
});
