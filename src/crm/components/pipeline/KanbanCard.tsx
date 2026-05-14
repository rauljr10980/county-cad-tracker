import { Badge } from '@/components/ui/badge'
import type { Deal, Lead } from '@/crm/data/types'
import { formatCurrency } from '@/crm/lib/utils'

type KanbanCardProps = {
  deal: Deal
  lead?: Lead
  onClick: () => void
}

const dayMs = 86400000
const OVERDUE_THRESHOLD_DAYS = 3

const formatAdded = (iso: string): string => {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

const isOverdue = (deal: Deal): boolean => {
  if (deal.stage === 'Closed Won' || deal.stage === 'Archived') return false
  const ageDays = (Date.now() - new Date(deal.createdAt).getTime()) / dayMs
  return ageDays >= OVERDUE_THRESHOLD_DAYS
}

export function KanbanCard({ deal, lead, onClick }: KanbanCardProps) {
  const overdue = isOverdue(deal)

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-border/70 bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{lead?.businessName ?? 'Unknown contact'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lead?.ownerName || 'Contact not added'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
          {lead ? <Badge variant="outline">{lead.websiteStatus}</Badge> : null}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
        <p className="text-lg font-semibold">{formatCurrency(deal.value)}</p>
          <p className="text-xs text-muted-foreground">{deal.probability}% probability</p>
        </div>
        <p className="text-xs text-muted-foreground">{deal.expectedCloseDate}</p>
      </div>
      <p className={`mt-2 text-[11px] ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
        Added {formatAdded(deal.createdAt)}
      </p>
    </button>
  )
}
