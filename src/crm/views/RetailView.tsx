import { useMemo, useState } from 'react'
import { CalendarPlus, Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSearchStore } from '@/crm/lib/searchStore'
import { Button } from '@/components/ui/button'
import { LeadDetailDrawer } from '@/crm/components/leads/LeadDetailDrawer'
import { LeadFormDialog } from '@/crm/components/leads/LeadFormDialog'
import { ScheduleMeetingDialog } from '@/crm/components/leads/ScheduleMeetingDialog'
import { useCrmStore } from '@/crm/store/useCrmStore'
import { effectiveLetterCadenceDays, selectRetail } from '@/crm/store/selectors'

const dayMs = 86400000

const formatDueLabel = (days: number) => {
  if (days > 1) return `due in ${days} days`
  if (days === 1) return 'due tomorrow'
  if (days === 0) return 'due today'
  return `overdue by ${Math.abs(days)} days`
}

export default function RetailView() {
  const retail = useCrmStore(useShallow(selectRetail))
  const settings = useCrmStore((state) => state.settings)
  const query = useSearchStore((state) => state.query).trim().toLowerCase()
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [scheduleLeadId, setScheduleLeadId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    return retail
      .filter((lead) => {
        if (!query) return true
        return `${lead.ownerName} ${lead.email} ${lead.phone} ${lead.notes}`
          .toLowerCase()
          .includes(query)
      })
      .map((lead) => {
        const cadence = effectiveLetterCadenceDays(lead, settings)
        const lastTouch = lead.lastContactedAt
          ? new Date(lead.lastContactedAt).getTime()
          : new Date(lead.createdAt).getTime()
        const dueAt = lastTouch + cadence * dayMs
        const daysFromNow = Math.round((dueAt - Date.now()) / dayMs)
        return { lead, cadence, dueAt, daysFromNow }
      })
      .sort((left, right) => left.daysFromNow - right.daysFromNow)
  }, [retail, query, settings])

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Retail</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} retail buyers in your sphere. Letter reminders keep your real estate name familiar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New Retail Contact
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border/70 bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Age</th>
              <th className="px-3 py-2 text-left">Last contact</th>
              <th className="px-3 py-2 text-left">Next letter</th>
              <th className="px-3 py-2 text-left">Schedule</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No retail contacts yet.
                </td>
              </tr>
            ) : null}
            {rows.map(({ lead, daysFromNow }) => (
              <tr
                key={lead.id}
                onClick={() => setOpenLeadId(lead.id)}
                className="cursor-pointer border-t border-border/60 hover:bg-accent/30"
              >
                <td className="px-3 py-2 font-medium">{lead.ownerName || '—'}</td>
                <td className="px-3 py-2">{lead.phone || '—'}</td>
                <td className="px-3 py-2">{lead.email || '—'}</td>
                <td className="px-3 py-2">{lead.ageRange ?? '—'}</td>
                <td className="px-3 py-2">
                  {lead.lastContactedAt
                    ? new Date(lead.lastContactedAt).toLocaleDateString()
                    : 'Never'}
                </td>
                <td className={`px-3 py-2 ${daysFromNow < 0 ? 'text-destructive font-medium' : ''}`}>
                  {formatDueLabel(daysFromNow)}
                </td>
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScheduleLeadId(lead.id)}
                  >
                    <CalendarPlus className="h-4 w-4" />
                    Schedule a meeting
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadFormDialog
        open={creating}
        onOpenChange={setCreating}
        defaultKind="retail"
      />
      <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      <ScheduleMeetingDialog
        leadId={scheduleLeadId}
        onClose={() => setScheduleLeadId(null)}
      />
    </div>
  )
}
