import { useEffect, useMemo } from 'react';
import type { Event } from 'react-big-calendar';
import { useAuth } from '@/contexts/AuthContext';
import { useFollowUps } from '@/hooks/useFollowUps';
import { useDrivingLeads } from '@/hooks/useDrivingLeads';
import { useCrmStore } from '@/crm/store/useCrmStore';
import type { FollowUp, DrivingLead } from '@/types/property';

export type CalendarEventKind = 'followup' | 'd4d' | 'crm';

export type CalendarEvent = Event & {
  id: string;
  kind: CalendarEventKind;
  completed: boolean;
  payload:
    | FollowUp
    | DrivingLead
    | { id: string; leadId: string; type: string; dueAt: string; completed: boolean; notes: string; completedAt: string | null };
};

export function followUpTitle(fu: FollowUp): string {
  if (fu.drivingLead) return fu.drivingLead.street || fu.drivingLead.rawAddress || 'D4$ Lead';
  if (fu.property) return fu.property.propertyAddress || fu.property.ownerName || 'Property';
  if (fu.preForeclosure) return fu.preForeclosure.address || 'Pre-FC';
  return 'Follow-up';
}

function crmTaskDuration(type: string) {
  return type === 'Meeting' || type === 'Property Tour' ? 60 * 60 * 1000 : 30 * 60 * 1000;
}

/**
 * Builds the unified follow-up/D4$/CRM event feed CalendarView renders,
 * scoped to one month, so other screens (the Dashboard) can read the same
 * events without re-deriving them. A window spanning a month boundary (e.g.
 * "this week" near month-end) only sees events in `monthKey` — no current
 * caller needs a boundary-spanning query.
 */
export function useCalendarEvents(monthKey: string): CalendarEvent[] {
  const { data: followUps = [] } = useFollowUps(monthKey);
  const { data: drivingLeads = [] } = useDrivingLeads();
  const { user } = useAuth();
  const crmHydrate = useCrmStore((s) => s.hydrate);
  const crmTasks = useCrmStore((s) => s.tasks);
  const crmLeads = useCrmStore((s) => s.leads);

  useEffect(() => {
    crmHydrate(new Date(), user?.id);
  }, [crmHydrate, user?.id]);

  const crmLeadById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);

  return useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];

    for (const fu of followUps) {
      const day = new Date(fu.date);
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59);
      list.push({
        id: fu.id,
        kind: fu.drivingLeadId ? 'd4d' : 'followup',
        title: followUpTitle(fu),
        start: day,
        end,
        allDay: true,
        completed: fu.completed,
        payload: fu,
      });
    }

    for (const lead of drivingLeads) {
      const wf = (lead.metadata as any) || {};
      if (!wf.scheduledFollowUpAt) continue;
      const day = new Date(wf.scheduledFollowUpAt);
      day.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59);
      const done = wf.lastFollowUpAt && new Date(wf.lastFollowUpAt) >= new Date(wf.scheduledFollowUpAt);
      list.push({
        id: `d4d-sched-${lead.id}`,
        kind: 'd4d',
        title: `D4$ ${lead.street || lead.rawAddress}`,
        start: day,
        end,
        allDay: true,
        completed: !!done,
        payload: lead,
      });
    }

    for (const task of crmTasks) {
      const lead = crmLeadById.get(task.leadId);
      const start = new Date(task.dueAt);
      const end = new Date(start.getTime() + crmTaskDuration(task.type));
      list.push({
        id: `crm-${task.id}`,
        kind: 'crm',
        title: `${task.type} · ${lead?.ownerName || lead?.businessName || 'Unknown'}`,
        start,
        end,
        allDay: false,
        completed: task.completed,
        payload: task,
      });
    }

    return list;
  }, [followUps, drivingLeads, crmTasks, crmLeadById]);
}
