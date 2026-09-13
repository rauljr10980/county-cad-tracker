import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingEventsPanel } from './UpcomingEventsPanel';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    kind: 'followup',
    title: 'Follow up with Jane',
    start: new Date(),
    end: new Date(),
    allDay: true,
    completed: false,
    payload: {} as never,
    ...overrides,
  };
}

describe('UpcomingEventsPanel', () => {
  it('lists upcoming, incomplete events sorted soonest-first', () => {
    const soon = makeEvent({ id: 'soon', title: 'Soon event', start: new Date(Date.now() + 3600_000) });
    const later = makeEvent({ id: 'later', title: 'Later event', start: new Date(Date.now() + 7200_000) });
    render(<UpcomingEventsPanel events={[later, soon]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Soon event');
    expect(items[1].textContent).toContain('Later event');
  });

  it('excludes completed and past events', () => {
    const completed = makeEvent({ id: 'done', title: 'Done event', completed: true, start: new Date(Date.now() + 3600_000) });
    const past = makeEvent({ id: 'past', title: 'Past event', start: new Date(Date.now() - 3600_000) });
    render(<UpcomingEventsPanel events={[completed, past]} />);
    expect(screen.queryByText('Done event')).toBeNull();
    expect(screen.queryByText('Past event')).toBeNull();
  });

  it('shows an empty-state message when there are no upcoming events', () => {
    render(<UpcomingEventsPanel events={[]} />);
    expect(screen.getByText(/no upcoming events/i)).toBeTruthy();
  });

  it('caps the list at 10 events', () => {
    const events = Array.from({ length: 15 }, (_, i) => makeEvent({ id: `e${i}`, title: `Event ${i}`, start: new Date(Date.now() + (i + 1) * 3600_000) }));
    render(<UpcomingEventsPanel events={events} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });
});
