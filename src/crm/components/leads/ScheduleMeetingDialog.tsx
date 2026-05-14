import { useEffect, useState } from 'react'
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
import { useToast } from '@/crm/components/ui/toast'
import { useCrmStore } from '@/crm/store/useCrmStore'

type Props = {
  leadId: string | null
  onClose: () => void
}

const nextBusinessDayAt10am = (now: Date): Date => {
  const target = new Date(now)
  target.setDate(target.getDate() + 1)
  // 0 = Sun, 6 = Sat
  const day = target.getDay()
  if (day === 6) target.setDate(target.getDate() + 2)
  else if (day === 0) target.setDate(target.getDate() + 1)
  target.setHours(10, 0, 0, 0)
  return target
}

const toDateTimeInputValue = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function ScheduleMeetingDialog({ leadId, onClose }: Props) {
  const lead = useCrmStore((state) =>
    state.leads.find((entry) => entry.id === leadId),
  )
  const addTask = useCrmStore((state) => state.addTask)
  const { show } = useToast()
  const [dueAt, setDueAt] = useState(() =>
    toDateTimeInputValue(nextBusinessDayAt10am(new Date())),
  )
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (leadId) {
      setDueAt(toDateTimeInputValue(nextBusinessDayAt10am(new Date())))
      setNotes('')
    }
  }, [leadId])

  const open = Boolean(leadId)

  const handleSave = () => {
    if (!leadId || !dueAt) return
    addTask({
      leadId,
      type: 'Meeting',
      dueAt: new Date(dueAt).toISOString(),
      notes: notes.trim(),
    })
    show('Meeting scheduled')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>
            {lead ? `With ${lead.ownerName || lead.businessName}.` : null} Creates a Meeting follow-up task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="schedule-meeting-when">When</Label>
            <Input
              id="schedule-meeting-when"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-meeting-notes">Notes (optional)</Label>
            <Input
              id="schedule-meeting-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What's the goal of this meeting?"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Schedule</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
