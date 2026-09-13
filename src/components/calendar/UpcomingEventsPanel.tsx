import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { KIND_COLORS } from './calendarColors';

type UpcomingEventsPanelProps = {
  events: CalendarEvent[];
};

export function UpcomingEventsPanel({ events }: UpcomingEventsPanelProps) {
  const now = new Date();
  const upcoming = events
    .filter((e) => !e.completed && (e.start as Date) >= now)
    .sort((a, b) => (a.start as Date).getTime() - (b.start as Date).getTime())
    .slice(0, 10);

  return (
    <div className="rounded-md border border-border/70 bg-card p-3 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">Upcoming Events</h3>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming events.</p>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: KIND_COLORS[event.kind].border }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{event.title as string}</p>
                <p className="text-xs text-muted-foreground">
                  {(event.start as Date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {!event.allDay && ` · ${(event.start as Date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
