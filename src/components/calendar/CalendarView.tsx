import { useState, useMemo, useCallback } from 'react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type NavigateAction,
  type SlotInfo,
  type ToolbarProps,
  type View,
} from 'react-big-calendar';
import withDragAndDropDefault from 'react-big-calendar/lib/addons/dragAndDrop';
import type { EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format as dateFnsFormat, getDay, parse, startOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Briefcase, Home, Car, Building2, Check, Undo2, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateFollowUp, useDeleteFollowUp } from '@/hooks/useFollowUps';
import { WORKFLOW_STAGES } from '@/types/property';
import type { FollowUp, WorkflowStage, Property, PreForeclosureRecord, DrivingLead } from '@/types/property';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getProperties, getPreForeclosures } from '@/lib/api';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { FullDetailsModal } from '@/components/preforeclosure/FullDetailsModal';
import { useCrmStore } from '@/crm/store/useCrmStore';
import { useCalendarEvents, followUpTitle, type CalendarEvent as CalEvent } from '@/hooks/useCalendarEvents';
import { UpcomingEventsPanel } from './UpcomingEventsPanel';
import { KIND_COLORS } from './calendarColors';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

// ── react-big-calendar setup ───────────────────────────────────────────────
const withDragAndDrop =
  (typeof withDragAndDropDefault === 'function'
    ? withDragAndDropDefault
    : (withDragAndDropDefault as unknown as { default: typeof withDragAndDropDefault }).default) as typeof withDragAndDropDefault;

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format: dateFnsFormat,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales,
});

const VIEW_LABELS: Record<View, string> = {
  month: 'Month', week: 'Week', work_week: 'Work Week', day: 'Day', agenda: 'Agenda',
};

const DragAndDropCalendar = withDragAndDrop<CalEvent, object>(Calendar);

// ── Toolbar ────────────────────────────────────────────────────────────────
function Toolbar({ label, onNavigate, onView, view, views }: ToolbarProps<CalEvent, object>) {
  const availableViews = Array.isArray(views)
    ? views
    : (Object.keys(views).filter((k) => views[k as View]) as View[]);
  const nav = (a: NavigateAction) => onNavigate(a);
  return (
    <div className="mb-3 flex flex-col gap-3 border-b border-border/70 pb-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => nav('TODAY')}>Today</Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => nav('PREV')}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => nav('NEXT')}><ChevronRight className="h-4 w-4" /></Button>
        <h2 className="min-w-[180px] text-base font-semibold lg:text-lg">{label}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Legend */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-blue-400" /> Follow-ups</span>
          <span className="flex items-center gap-1"><Car className="h-3 w-3 text-purple-400" /> D4$</span>
          <span className="flex items-center gap-1"><Briefcase className="h-3 w-3 text-amber-400" /> CRM</span>
        </div>
        {/* View switcher */}
        <div className="flex rounded-md border border-border/70 bg-background p-0.5">
          {availableViews.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium transition',
                v === view ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {VIEW_LABELS[v] ?? v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function CalendarView() {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedPreForeclosure, setSelectedPreForeclosure] = useState<PreForeclosureRecord | null>(null);

  const monthKey = format(date, 'yyyy-MM');
  const updateMutation = useUpdateFollowUp();
  const deleteMutation = useDeleteFollowUp();

  // CRM
  const crmLeads = useCrmStore((s) => s.leads);
  const crmReschedule = useCrmStore((s) => s.rescheduleTask);
  const crmLeadById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);
  const events = useCalendarEvents(monthKey);

  // ── Event styling ────────────────────────────────────────────────────────
  const eventStyleGetter = useCallback((event: CalEvent) => {
    const c = KIND_COLORS[event.kind];
    return {
      style: {
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `4px solid ${c.border}`,
        color: c.text,
        borderRadius: '4px',
        opacity: event.completed ? 0.55 : 1,
        textDecoration: event.completed ? 'line-through' : 'none',
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  }, []);

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const onEventDrop = useCallback(({ event, start }: EventInteractionArgs<CalEvent>) => {
    if (event.kind === 'crm') {
      const task = event.payload as any;
      crmReschedule(task.id, (start as Date).toISOString());
      toast({ title: 'CRM task rescheduled' });
    } else if (event.kind === 'followup') {
      const fu = event.payload as FollowUp;
      updateMutation.mutate({ id: fu.id, date: format(start as Date, 'yyyy-MM-dd') });
      toast({ title: 'Follow-up rescheduled' });
    }
  }, [crmReschedule, updateMutation]);

  const onEventResize = useCallback(({ event, start }: EventInteractionArgs<CalEvent>) => {
    if (event.kind === 'crm') {
      const task = event.payload as any;
      crmReschedule(task.id, (start as Date).toISOString());
    }
  }, [crmReschedule]);

  // ── View details helpers ─────────────────────────────────────────────────
  const handleViewDetails = async (event: CalEvent) => {
    if (event.kind === 'crm') return;
    const fu = event.payload as FollowUp;
    if (fu.propertyId) {
      try {
        const result = await getProperties(1, 50000);
        const found = (result.properties || result.data || result as Property[]).find((p: Property) => p.id === fu.propertyId);
        if (found) setSelectedProperty(found);
      } catch { toast({ title: 'Error loading property', variant: 'destructive' }); }
    } else if (fu.preForeclosure) {
      try {
        const records = await getPreForeclosures();
        const found = records.find((r: PreForeclosureRecord) => r.document_number === fu.preForeclosure?.documentNumber);
        if (found) setSelectedPreForeclosure(found);
      } catch { toast({ title: 'Error loading record', variant: 'destructive' }); }
    }
    setSelectedEvent(null);
  };

  const handleToggleComplete = async (event: CalEvent) => {
    const fu = event.payload as FollowUp;
    await updateMutation.mutateAsync({ id: fu.id, completed: !fu.completed });
    toast({ title: fu.completed ? 'Marked as pending' : 'Marked as complete' });
    setSelectedEvent(null);
  };

  const handleDelete = async (event: CalEvent) => {
    const fu = event.payload as FollowUp;
    await deleteMutation.mutateAsync(fu.id);
    toast({ title: 'Follow-up deleted' });
    setSelectedEvent(null);
  };

  // ── Slot click (future: create event) ───────────────────────────────────
  const onSelectSlot = useCallback((_slot: SlotInfo) => {
    // Future: open create dialog
  }, []);

  // ── Detail dialog content ────────────────────────────────────────────────
  const renderEventDetail = () => {
    if (!selectedEvent) return null;
    const { kind, payload, completed } = selectedEvent;
    const c = KIND_COLORS[kind];

    if (kind === 'crm') {
      const task = payload as any;
      const lead = crmLeadById.get(task.leadId);
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={c.badge}>CRM</Badge>
            <Badge variant="outline" className="text-xs">{task.type}</Badge>
          </div>
          <div>
            <p className="font-medium">{lead?.ownerName || lead?.businessName || 'Unknown'}</p>
            {lead?.firm && <p className="text-sm text-muted-foreground">{lead.firm}</p>}
            {lead?.phone && <p className="text-sm text-muted-foreground">{lead.phone}</p>}
          </div>
          {task.notes && <p className="text-sm italic text-muted-foreground">{task.notes}</p>}
          <p className="text-xs text-muted-foreground">
            {format(new Date(task.dueAt), 'EEEE, MMMM d · h:mm a')}
          </p>
        </div>
      );
    }

    if (kind === 'd4d') {
      const lead = payload as DrivingLead;
      const wf = (lead.metadata as any) || {};
      const address = lead.street || lead.rawAddress;
      return (
        <div className="space-y-3">
          <Badge variant="outline" className={c.badge}>Driving 4$</Badge>
          <p className="font-medium">{address}</p>
          {lead.ownerName && <p className="text-sm text-muted-foreground">{lead.ownerName}</p>}
          {wf.lastFollowUpAt && (
            <p className="text-xs text-muted-foreground">Last follow-up: {formatDistanceToNow(new Date(wf.lastFollowUpAt), { addSuffix: true })}</p>
          )}
          <Badge variant="outline" className={isPast(new Date(wf.scheduledFollowUpAt || selectedEvent.start as Date)) && !completed ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs' : 'text-xs'}>
            {completed ? '✓ Done' : isPast(new Date(wf.scheduledFollowUpAt || selectedEvent.start as Date)) ? '⚠ Overdue' : 'Pending'}
          </Badge>
        </div>
      );
    }

    // Follow-up
    const fu = payload as FollowUp;
    const stage = fu.property?.workflowStage || fu.preForeclosure?.workflowStage || '';
    const stageLabel = WORKFLOW_STAGES[stage as WorkflowStage]?.shortLabel || '';
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={c.badge}>
            {fu.preForeclosure ? 'Pre-Foreclosure' : 'Property'}
          </Badge>
          {stageLabel && <Badge variant="outline" className="text-xs">{stageLabel}</Badge>}
          {fu.preForeclosure?.type && (
            <Badge variant="outline" className={cn('text-xs', fu.preForeclosure.type === 'Mortgage' ? 'bg-purple-500/20 text-purple-400' : 'bg-orange-500/20 text-orange-400')}>
              {fu.preForeclosure.type}
            </Badge>
          )}
        </div>
        <p className="font-medium">{followUpTitle(fu)}</p>
        {fu.note && <p className="text-sm italic text-muted-foreground">{fu.note}</p>}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleViewDetails(selectedEvent)}>
            <Eye className="h-3 w-3 mr-1" /> Open
          </Button>
          <Button
            size="sm"
            variant={fu.completed ? 'outline' : 'default'}
            className={cn(!fu.completed && 'bg-green-600 hover:bg-green-700')}
            disabled={updateMutation.isPending}
            onClick={() => handleToggleComplete(selectedEvent)}
          >
            {fu.completed ? <><Undo2 className="h-3 w-3 mr-1" />Undo</> : <><Check className="h-3 w-3 mr-1" />Complete</>}
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/50" disabled={deleteMutation.isPending} onClick={() => handleDelete(selectedEvent)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-md border border-border/70 bg-card p-3 shadow-sm calendar-container">
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            onSelectEvent={setSelectedEvent}
            onSelectSlot={onSelectSlot}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            resizable
            selectable
            eventPropGetter={eventStyleGetter}
            components={{ toolbar: Toolbar }}
            style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}
            popup
          />
        </div>
        <UpcomingEventsPanel events={events} />
      </div>

      {/* Event detail dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedEvent?.title as string}</DialogTitle>
          </DialogHeader>
          {renderEventDetail()}
        </DialogContent>
      </Dialog>

      <PropertyDetailsModal property={selectedProperty} isOpen={!!selectedProperty} onClose={() => setSelectedProperty(null)} />
      <FullDetailsModal record={selectedPreForeclosure} isOpen={!!selectedPreForeclosure} onClose={() => setSelectedPreForeclosure(null)} />
    </div>
  );
}
