/**
 * The pipeline's work queues and the relative-time labels its table renders.
 *
 * Both label helpers compare whole UTC days rather than elapsed milliseconds:
 * a follow-up set for 00:30 today is due today, not eighteen hours overdue.
 * UTC matches the backend's queue boundaries, so a row's label and the tab it
 * appears under always agree.
 */

export const QUEUES = [
  { id: 'all', label: 'All' },
  { id: 'needsContact', label: 'Needs contact' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'dueToday', label: 'Due today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'parked', label: 'Parked' },
  { id: 'closed', label: 'Closed' },
] as const;

export type QueueId = (typeof QUEUES)[number]['id'];

/** Whole UTC days from `a` to `b`; negative when `b` is earlier. */
const dayDelta = (a: Date, b: Date): number => {
  const dayA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dayB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((dayB - dayA) / 86_400_000);
};

/**
 * "Never" is deliberate. A dash reads as missing data; "Never" reads as a fact
 * about the lead, which is what it is.
 */
export const lastContactLabel = (iso: string | null | undefined, now = new Date()): string => {
  if (!iso) return 'Never';
  const days = dayDelta(new Date(iso), now);
  if (days <= 0) return 'Today';
  return `${days}d ago`;
};

/** Relative, so urgency reads without the viewer doing date arithmetic. */
export const followUpLabel = (iso: string | null | undefined, now = new Date()): string => {
  if (!iso) return '—';
  const days = dayDelta(now, new Date(iso));
  if (days === 0) return 'Today';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
};
