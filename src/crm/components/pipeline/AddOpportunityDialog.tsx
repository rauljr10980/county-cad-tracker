import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/crm/components/ui/toast'
import { useCrmStore } from '@/crm/store/useCrmStore'

type AddOpportunityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (leadId: string) => void
}

export function AddOpportunityDialog({
  open,
  onOpenChange,
  onCreated,
}: AddOpportunityDialogProps) {
  const leads = useCrmStore((state) => state.leads)
  const deals = useCrmStore((state) => state.deals)
  const createOpportunity = useCrmStore((state) => state.createOpportunity)
  const { show } = useToast()
  const [query, setQuery] = useState('')

  const opportunityLeadIds = useMemo(
    () => new Set(deals.map((deal) => deal.leadId)),
    [deals],
  )

  const availableContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return leads
      .filter((lead) => !opportunityLeadIds.has(lead.id))
      .filter((lead) => {
        if (!normalizedQuery) return true
        return `${lead.ownerName} ${lead.firm} ${lead.businessName} ${lead.city} ${lead.email} ${lead.lastConversationNotes}`
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((left, right) =>
        (left.ownerName || left.businessName).localeCompare(
          right.ownerName || right.businessName,
        ),
      )
  }, [leads, opportunityLeadIds, query])

  const addOpportunity = (leadId: string) => {
    const deal = createOpportunity(leadId)
    if (!deal) return
    show('Moved contact into Opportunities')
    onCreated?.(leadId)
    setQuery('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setQuery('')
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add From Contacts or Retail</DialogTitle>
          <DialogDescription>
            Move a relationship into Opportunities when there is active buying intent.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts..."
            className="pl-9"
          />
        </div>

        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {availableContacts.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => addOpportunity(lead.id)}
              className="w-full rounded-md border border-border/70 bg-background p-3 text-left transition hover:border-primary/50 hover:bg-accent/30"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{lead.ownerName || lead.businessName}</p>
                    <span className="rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {lead.kind === 'retail' ? 'Retail' : 'Contact'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lead.kind === 'retail'
                      ? lead.email || lead.phone || 'No contact info'
                      : lead.firm || lead.businessName || 'Firm not added'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{lead.city || '—'}</p>
              </div>
              {lead.lastConversationNotes ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {lead.lastConversationNotes}
                </p>
              ) : null}
            </button>
          ))}

          {availableContacts.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No contacts or retail buyers available to move into Opportunities.
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
