import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/crm/components/ui/toast'
import { TASK_TYPES, type Lead, type TaskType } from '@/crm/data/types'
import { useCrmStore } from '@/crm/store/useCrmStore'

type ScheduleTaskDialogProps = {
  start: Date | null
  onClose: () => void
  onCreated?: (leadId: string) => void
}

const toDateTimeInputValue = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const labelFor = (lead: Lead, opportunityLeadIds: Set<string>): string => {
  if (opportunityLeadIds.has(lead.id)) return 'Opportunity'
  if (lead.kind === 'retail') return 'Retail'
  return 'Contact'
}

export function ScheduleTaskDialog({
  start,
  onClose,
  onCreated,
}: ScheduleTaskDialogProps) {
  const leads = useCrmStore((state) => state.leads)
  const deals = useCrmStore((state) => state.deals)
  const addTask = useCrmStore((state) => state.addTask)
  const { show } = useToast()
  const [query, setQuery] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [type, setType] = useState<TaskType>('Call')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')

  const open = Boolean(start)

  useEffect(() => {
    if (!start) return
    setQuery('')
    setSelectedLeadId('')
    setType('Call')
    setDueAt(toDateTimeInputValue(start))
    setNotes('')
  }, [start])

  const opportunityLeadIds = useMemo(
    () => new Set(deals.map((deal) => deal.leadId)),
    [deals],
  )

  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return leads
      .filter((lead) => {
        if (!normalizedQuery) return true
        return `${lead.ownerName} ${lead.businessName} ${lead.firm} ${lead.email} ${lead.phone} ${lead.lastConversationNotes}`
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((left, right) => {
        const leftLabel = labelFor(left, opportunityLeadIds)
        const rightLabel = labelFor(right, opportunityLeadIds)
        return (
          leftLabel.localeCompare(rightLabel) ||
          (left.ownerName || left.businessName).localeCompare(
            right.ownerName || right.businessName,
          )
        )
      })
      .slice(0, 18)
  }, [leads, opportunityLeadIds, query])

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId)

  const handleSave = () => {
    if (!selectedLeadId || !dueAt) return
    addTask({
      leadId: selectedLeadId,
      type,
      dueAt: new Date(dueAt).toISOString(),
      notes: notes.trim(),
    })
    show('Task scheduled')
    onCreated?.(selectedLeadId)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule From Calendar</DialogTitle>
          <DialogDescription>
            Pick a contact, retail buyer, or opportunity and create a follow-up on this time slot.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people..."
                className="pl-9"
              />
            </div>

            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {filteredLeads.map((lead) => {
                const active = lead.id === selectedLeadId
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border/70 bg-background hover:border-primary/50 hover:bg-accent/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {lead.ownerName || lead.businessName || 'Unnamed'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lead.kind === 'retail'
                            ? lead.email || lead.phone || 'Retail buyer'
                            : lead.firm || lead.businessName || 'Relationship'}
                        </p>
                      </div>
                      <Badge variant={active ? 'default' : 'outline'}>
                        {labelFor(lead, opportunityLeadIds)}
                      </Badge>
                    </div>
                  </button>
                )
              })}
              {filteredLeads.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No matching people found.
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs uppercase text-muted-foreground">Selected</p>
              <p className="mt-1 text-sm font-medium">
                {selectedLead
                  ? selectedLead.ownerName || selectedLead.businessName
                  : 'Choose someone from the list'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Task Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as TaskType)}>
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
              <Label htmlFor="calendar-task-when">When</Label>
              <Input
                id="calendar-task-when"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="calendar-task-notes">Notes</Label>
              <Input
                id="calendar-task-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Reason, context, or next step."
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selectedLeadId || !dueAt}>
            Schedule Task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
