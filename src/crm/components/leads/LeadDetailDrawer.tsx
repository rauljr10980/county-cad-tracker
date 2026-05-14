import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  Briefcase,
  MessageSquare,
  Phone,
  StickyNote,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/crm/components/ui/toast'
import {
  PIPELINE_STAGES,
  TASK_TYPES,
  type PipelineStage,
  type TaskType,
} from '@/crm/data/types'
import { formatCurrency, formatRelative } from '@/crm/lib/utils'
import { effectiveLetterCadenceDays } from '@/crm/store/selectors'
import { useCrmStore } from '@/crm/store/useCrmStore'
import { LeadForm } from './LeadForm'

type LeadDetailDrawerProps = {
  leadId: string | null
  onClose: () => void
}

const toDateTimeInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const defaultTaskDraft = () => ({
  type: 'Call' as TaskType,
  dueAt: toDateTimeInputValue(new Date(Date.now() + 86400000)),
  notes: '',
})

export function LeadDetailDrawer({ leadId, onClose }: LeadDetailDrawerProps) {
  const leads = useCrmStore((state) => state.leads)
  const deals = useCrmStore((state) => state.deals)
  const allTasks = useCrmStore((state) => state.tasks)
  const allActivities = useCrmStore((state) => state.activities)
  const lead = useMemo(() => leads.find((entry) => entry.id === leadId), [leadId, leads])
  const deal = useMemo(() => deals.find((entry) => entry.leadId === leadId), [deals, leadId])
  const tasks = useMemo(
    () =>
      allTasks
        .filter((task) => task.leadId === leadId)
        .sort((left, right) => {
          if (left.completed !== right.completed) {
            return Number(left.completed) - Number(right.completed)
          }
          return +new Date(left.dueAt) - +new Date(right.dueAt)
        }),
    [allTasks, leadId],
  )
  const activities = useMemo(
    () =>
      allActivities
        .filter((activity) => activity.leadId === leadId)
        .sort((left, right) => +new Date(right.timestamp) - +new Date(left.timestamp)),
    [allActivities, leadId],
  )
  const updateLead = useCrmStore((state) => state.updateLead)
  const deleteLead = useCrmStore((state) => state.deleteLead)
  const createOpportunity = useCrmStore((state) => state.createOpportunity)
  const removeOpportunity = useCrmStore((state) => state.removeOpportunity)
  const setLeadKind = useCrmStore((state) => state.setLeadKind)
  const moveOpportunityToRetail = useCrmStore((state) => state.moveOpportunityToRetail)
  const moveDealStage = useCrmStore((state) => state.moveDealStage)
  const updateDeal = useCrmStore((state) => state.updateDeal)
  const addTask = useCrmStore((state) => state.addTask)
  const completeTask = useCrmStore((state) => state.completeTask)
  const addActivity = useCrmStore((state) => state.addActivity)
  const settings = useCrmStore((state) => state.settings)
  const { show } = useToast()

  const [taskDraft, setTaskDraft] = useState(defaultTaskDraft)
  const [note, setNote] = useState('')

  useEffect(() => {
    setTaskDraft(defaultTaskDraft())
    setNote('')
  }, [leadId])

  const open = useMemo(() => Boolean(leadId), [leadId])

  if (!lead) {
    return (
      <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <SheetContent />
      </Sheet>
    )
  }

  const lastTouchLabel = lead.lastContactedAt
    ? `${formatRelative(lead.lastContactedAt)} (${new Date(lead.lastContactedAt).toLocaleString()})`
    : 'Not contacted yet'

  const logTouchpoint = (kind: 'call' | 'text' | 'meeting', label: string) => {
    addActivity(lead.id, kind, `${label} logged from CRM workspace`)
    show(`${label} logged`)
  }

  const saveTask = () => {
    if (!taskDraft.dueAt) return
    addTask({
      leadId: lead.id,
      type: taskDraft.type,
      dueAt: new Date(taskDraft.dueAt).toISOString(),
      notes: taskDraft.notes.trim(),
    })
    setTaskDraft(defaultTaskDraft())
    show('Task scheduled')
  }

  const saveNote = () => {
    if (!note.trim()) return
    addActivity(lead.id, 'note', note.trim())
    setNote('')
    show('Note added')
  }

  const promptMoveToRetail = (id: string) => {
    if (window.confirm('Move this contact to Retail for ongoing nurture?')) {
      setLeadKind(id, 'retail')
      show('Moved to Retail')
    }
  }

  const handleDealStageChange = (nextStage: PipelineStage) => {
    if (!deal) return

    if (nextStage === 'Closed Won') {
      const input = window.prompt('Final opportunity value', String(deal.value))
      if (input === null) return
      const parsedValue = Number(input)
      if (!Number.isNaN(parsedValue)) {
        updateDeal(deal.id, { value: parsedValue, probability: 100 })
      }
      moveDealStage(deal.id, nextStage)
      show('Opportunity marked Closed Won')
      promptMoveToRetail(deal.leadId)
      return
    }

    moveDealStage(deal.id, nextStage)
    show(
      nextStage === 'Offer / LOI'
        ? 'Offer / LOI logged. Follow-up automation queued.'
        : `Stage moved to ${nextStage}`,
    )
    if (nextStage === 'Archived') {
      promptMoveToRetail(deal.leadId)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent className="max-w-xl">
        <SheetHeader>
          <div className="pr-8">
            <SheetTitle>
              {lead.kind === 'retail'
                ? lead.ownerName || 'Retail contact'
                : lead.businessName || lead.ownerName}
            </SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {lead.kind === 'retail'
                ? `${lead.email || 'No email'} · ${lead.phone || 'No phone'}`
                : `${lead.ownerName || 'Contact not added'} | ${lead.city || 'City not added'}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={lead.kind === 'retail' ? 'default' : 'secondary'}>
                {lead.kind === 'retail' ? 'Retail' : lead.industry}
              </Badge>
              <Badge variant={deal ? 'default' : 'outline'}>
                {deal ? 'Opportunity' : lead.kind === 'retail' ? 'Retail' : 'Contact'}
              </Badge>
              {lead.kind === 'retail' ? (
                lead.ageRange ? <Badge variant="outline">Age {lead.ageRange}</Badge> : null
              ) : (
                <>
                  <Badge variant="outline">{lead.websiteStatus}</Badge>
                  <Badge variant="outline">{lead.connectionRating ?? 'none'}</Badge>
                </>
              )}
              <Badge variant="outline">{lead.source}</Badge>
            </div>
          </div>

          {lead.phone ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${lead.phone}`}>
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <Tabs defaultValue="details">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="rounded-md border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Last contact</p>
              <p className="mt-1 text-sm text-muted-foreground">{lastTouchLabel}</p>
            </div>

            {lead.kind === 'retail' ? (
              <div className="rounded-md border border-border/70 bg-muted/30 p-4">
                <p className="text-sm font-medium">Letter cadence</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(() => {
                    const cadence = effectiveLetterCadenceDays(lead, settings)
                    const lastTouch = lead.lastContactedAt
                      ? new Date(lead.lastContactedAt).getTime()
                      : new Date(lead.createdAt).getTime()
                    const dueAt = lastTouch + cadence * 86400000
                    const daysFromNow = Math.round((dueAt - Date.now()) / 86400000)
                    const dueLabel =
                      daysFromNow > 1
                        ? `next due in ${daysFromNow} days`
                        : daysFromNow === 1
                          ? 'next due tomorrow'
                          : daysFromNow === 0
                            ? 'due today'
                            : `overdue by ${Math.abs(daysFromNow)} days`
                    return `${cadence} days · ${dueLabel}`
                  })()}
                </p>
              </div>
            ) : null}

            <LeadForm
              key={lead.id}
              initial={lead}
              submitLabel="Save Changes"
              onSubmit={(values) => {
                updateLead(lead.id, values)
                show('Contact updated')
              }}
            />

            {deal ? (
              <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">Opportunity</p>
                  <p className="text-sm font-semibold">{formatCurrency(deal.value)}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Stage</Label>
                  <Select
                    value={deal.stage}
                    onValueChange={(value) => handleDealStageChange(value as PipelineStage)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Value</Label>
                    <Input
                      type="number"
                      value={deal.value}
                      onChange={(event) =>
                        updateDeal(deal.id, { value: Number(event.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Probability</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={deal.probability}
                      onChange={(event) =>
                        updateDeal(deal.id, {
                          probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Expected close date</Label>
                    <Input
                      type="date"
                      value={deal.expectedCloseDate}
                      onChange={(event) =>
                        updateDeal(deal.id, { expectedCloseDate: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      removeOpportunity(lead.id)
                      show('Moved opportunity back to Contacts')
                    }}
                  >
                    <Undo2 className="h-4 w-4" />
                    Move Back to Contacts
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      moveOpportunityToRetail(lead.id)
                      show('Moved opportunity to Retail')
                    }}
                  >
                    Move to Retail
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (createOpportunity(lead.id)) {
                      show('Moved contact into Opportunities')
                    }
                  }}
                >
                  <Briefcase className="h-4 w-4" />
                  Move to Opportunities
                </Button>
                {lead.kind === 'industry' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLeadKind(lead.id, 'retail')
                      show('Moved to Retail')
                    }}
                  >
                    Move to Retail
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLeadKind(lead.id, 'industry')
                      show('Moved to Contacts')
                    }}
                  >
                    Move to Contacts
                  </Button>
                )}
              </div>
            )}

            <Separator />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${lead.businessName || lead.ownerName}? This also removes its opportunity, tasks, and activity log.`,
                  )
                ) {
                  deleteLead(lead.id)
                  onClose()
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete Contact
            </Button>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <div className="rounded-md border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-medium">Quick log</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => logTouchpoint('call', 'Call')}>
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
                <Button variant="outline" size="sm" onClick={() => logTouchpoint('text', 'Text')}>
                  <MessageSquare className="h-4 w-4" />
                  Text
                </Button>
                <Button variant="outline" size="sm" onClick={() => logTouchpoint('meeting', 'Meeting')}>
                  <CalendarClock className="h-4 w-4" />
                  Meeting
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-note">Add note</Label>
              <textarea
                id="lead-note"
                className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Log the latest call, meeting notes, personal detail, objection, or next step."
              />
              <Button onClick={saveNote}>
                <StickyNote className="h-4 w-4" />
                Add Note
              </Button>
            </div>

            <div className="rounded-md border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-medium">Schedule a task</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={taskDraft.type}
                    onValueChange={(value) =>
                      setTaskDraft((current) => ({ ...current, type: value as TaskType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((taskType) => (
                        <SelectItem key={taskType} value={taskType}>
                          {taskType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reminder</Label>
                  <Input
                    type="datetime-local"
                    value={taskDraft.dueAt}
                    onChange={(event) =>
                      setTaskDraft((current) => ({ ...current, dueAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={taskDraft.notes}
                    onChange={(event) =>
                      setTaskDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="What should happen on this follow-up?"
                  />
                </div>
              </div>
              <Button className="mt-3" onClick={saveTask}>
                Add Task
              </Button>
            </div>

            {tasks.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Tasks</p>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-md border border-border/70 bg-background/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => !task.completed && completeTask(task.id)}
                          className="mt-1 h-4 w-4"
                        />
                        <div>
                          <p
                            className={
                              task.completed
                                ? 'text-sm text-muted-foreground line-through'
                                : 'text-sm font-medium'
                            }
                          >
                            {task.type}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Due {new Date(task.dueAt).toLocaleString()}
                          </p>
                          {task.notes ? (
                            <p className="mt-1 text-sm text-muted-foreground">{task.notes}</p>
                          ) : null}
                        </div>
                      </div>
                      <Badge variant={task.completed ? 'secondary' : 'outline'}>
                        {task.completed ? 'Done' : 'Open'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {activities.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Timeline</p>
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-md border border-border/70 bg-background/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{activity.body}</p>
                      <Badge variant="outline" className="shrink-0">
                        {activity.kind}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelative(activity.timestamp)} ·{' '}
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {tasks.length === 0 && activities.length === 0 ? (
              <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                No tasks or activity yet.
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
