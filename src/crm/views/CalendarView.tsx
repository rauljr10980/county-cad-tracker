import { useMemo, useState } from 'react'
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type Event,
  type NavigateAction,
  type SlotInfo,
  type ToolbarProps,
  type View,
} from 'react-big-calendar'
import withDragAndDropDefault from 'react-big-calendar/lib/addons/dragAndDrop'
import type { EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, getDay, parse, startOfWeek } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { ScheduleTaskDialog } from '@/crm/components/calendar/ScheduleTaskDialog'
import { LeadDetailDrawer } from '@/crm/components/leads/LeadDetailDrawer'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/crm/components/ui/toast'
import type { Task, TaskType } from '@/crm/data/types'
import { cn } from '@/crm/lib/utils'
import { useCrmStore } from '@/crm/store/useCrmStore'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

// Vite's CJS interop can double-wrap the addon export.
const withDragAndDrop =
  (typeof withDragAndDropDefault === 'function'
    ? withDragAndDropDefault
    : (withDragAndDropDefault as unknown as { default: typeof withDragAndDropDefault }).default) as typeof withDragAndDropDefault

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales,
})

type TaskEvent = Event & {
  taskId: string
  leadId: string
  type: TaskType
  completed: boolean
}

const DragAndDropCalendar = withDragAndDrop<TaskEvent, object>(Calendar)

const TYPE_COLORS: Record<TaskType, { bg: string; border: string; text: string }> = {
  Call: { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  Text: { bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
  Email: { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
  Meeting: { bg: '#ede9fe', border: '#8b5cf6', text: '#4c1d95' },
  'Property Tour': { bg: '#fce7f3', border: '#ec4899', text: '#831843' },
  'Send Listings': { bg: '#cffafe', border: '#06b6d4', text: '#164e63' },
  'Send CMA': { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' },
  'Send Letter': { bg: '#ffedd5', border: '#f97316', text: '#7c2d12' },
}

const VIEW_LABELS: Record<View, string> = {
  month: 'Month',
  week: 'Week',
  work_week: 'Work Week',
  day: 'Day',
  agenda: 'Agenda',
}

const taskDurationMs = (task: Task): number => {
  if (task.type === 'Meeting' || task.type === 'Property Tour') return 60 * 60 * 1000
  return 30 * 60 * 1000
}

function CalendarToolbar({
  label,
  onNavigate,
  onView,
  view,
  views,
}: ToolbarProps<TaskEvent, object>) {
  const availableViews = Array.isArray(views)
    ? views
    : (Object.keys(views).filter((key) => views[key as View]) as View[])

  const navigate = (action: NavigateAction) => onNavigate(action)

  return (
    <div className="mb-3 flex flex-col gap-3 border-b border-border/70 pb-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => navigate('TODAY')}
        >
          Today
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('PREV')}>
          Back
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('NEXT')}>
          Next
        </Button>
        <h2 className="min-w-[180px] text-base font-semibold lg:text-lg">{label}</h2>
      </div>

      <div className="flex rounded-md border border-border/70 bg-background p-1">
        {availableViews.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onView(option)}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium transition',
              option === view
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {VIEW_LABELS[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CalendarView() {
  const tasks = useCrmStore((state) => state.tasks)
  const leads = useCrmStore((state) => state.leads)
  const rescheduleTask = useCrmStore((state) => state.rescheduleTask)
  const deleteTask = useCrmStore((state) => state.deleteTask)
  const { show } = useToast()
  const [view, setView] = useState<View>(Views.MONTH)
  const [date, setDate] = useState<Date>(new Date())
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [taskDraftStart, setTaskDraftStart] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<TaskEvent | null>(null)

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])

  const events = useMemo<TaskEvent[]>(() => {
    return tasks.map((task) => {
      const start = new Date(task.dueAt)
      const end = new Date(start.getTime() + taskDurationMs(task))
      const lead = leadById.get(task.leadId)
      const titleParts: string[] = [task.type]
      if (lead) titleParts.push(lead.ownerName || lead.businessName || 'Unknown')
      if (task.notes) titleParts.push(`- ${task.notes}`)
      return {
        taskId: task.id,
        leadId: task.leadId,
        type: task.type,
        completed: task.completed,
        title: titleParts.join(' | '),
        start,
        end,
        allDay: false,
      }
    })
  }, [tasks, leadById])

  const eventStyleGetter = (event: TaskEvent) => {
    const colors = TYPE_COLORS[event.type] ?? TYPE_COLORS.Call
    return {
      style: {
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        color: colors.text,
        borderRadius: '4px',
        opacity: event.completed ? 0.55 : 1,
        textDecoration: event.completed ? 'line-through' : 'none',
        fontSize: '12px',
        padding: '2px 6px',
      },
    }
  }

  const onSelectEvent = (event: TaskEvent) => {
    setSelectedEvent(event)
  }

  const onSelectSlot = (slot: SlotInfo) => {
    setTaskDraftStart(slot.start)
  }

  const onEventDrop = ({ event, start }: EventInteractionArgs<TaskEvent>) => {
    rescheduleTask(event.taskId, (start as Date).toISOString())
  }

  const onEventResize = ({ event, start }: EventInteractionArgs<TaskEvent>) => {
    rescheduleTask(event.taskId, (start as Date).toISOString())
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            All follow-ups, meetings, and retail letters. Drag to reschedule, or click an empty slot to add one.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/70 bg-card p-3 shadow-sm">
        <DragAndDropCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={(next) => setView(next)}
          date={date}
          onNavigate={(next) => setDate(next)}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          onSelectEvent={onSelectEvent}
          onSelectSlot={onSelectSlot}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          resizable
          selectable
          eventPropGetter={eventStyleGetter}
          components={{ toolbar: CalendarToolbar }}
          style={{ height: 'calc(100vh - 220px)', minHeight: '600px' }}
          popup
        />
      </div>

      <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      <ScheduleTaskDialog
        start={taskDraftStart}
        onClose={() => setTaskDraftStart(null)}
        onCreated={(leadId) => setOpenLeadId(leadId)}
      />

      <Dialog
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedEvent
                ? `${selectedEvent.type} · ${leadById.get(selectedEvent.leadId)?.ownerName || leadById.get(selectedEvent.leadId)?.businessName || 'Unknown contact'}`
                : 'Task'}
            </DialogTitle>
            <DialogDescription>
              {selectedEvent ? new Date(selectedEvent.start as Date).toLocaleString() : ''}
              {selectedEvent?.title && typeof selectedEvent.title === 'string'
                ? selectedEvent.title.includes(' - ')
                  ? ` · ${selectedEvent.title.split(' - ').slice(1).join(' - ')}`
                  : ''
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedEvent) setOpenLeadId(selectedEvent.leadId)
                setSelectedEvent(null)
              }}
            >
              Open contact
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedEvent) {
                  deleteTask(selectedEvent.taskId)
                  show('Task deleted')
                }
                setSelectedEvent(null)
              }}
            >
              Delete task
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
