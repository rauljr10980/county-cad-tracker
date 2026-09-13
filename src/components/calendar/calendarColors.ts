import type { CalendarEventKind } from '@/hooks/useCalendarEvents';

export const KIND_COLORS: Record<CalendarEventKind, { bg: string; border: string; text: string; badge: string }> = {
  followup: { bg: '#1e3a5f',  border: '#3b82f6', text: '#93c5fd', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  d4d:      { bg: '#3b1f6b',  border: '#8b5cf6', text: '#c4b5fd', badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  crm:      { bg: '#78350f',  border: '#f59e0b', text: '#fcd34d', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};
