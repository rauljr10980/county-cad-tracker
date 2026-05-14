import { useMemo, useState } from 'react'
import { LeadDetailDrawer } from '@/crm/components/leads/LeadDetailDrawer'
import { AddOpportunityDialog } from '@/crm/components/pipeline/AddOpportunityDialog'
import { KanbanBoard } from '@/crm/components/pipeline/KanbanBoard'
import { Button } from '@/components/ui/button'
import { useCrmStore } from '@/crm/store/useCrmStore'
import { formatCurrency } from '@/crm/lib/utils'
import { Plus } from 'lucide-react'

export default function OpportunitiesView() {
  const deals = useCrmStore((state) => state.deals)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [addOpportunityOpen, setAddOpportunityOpen] = useState(false)

  const stats = useMemo(() => {
    const openDeals = deals.filter(
      (deal) => deal.stage !== 'Closed Won' && deal.stage !== 'Archived',
    )
    const openValue = openDeals.reduce((sum, deal) => sum + deal.value, 0)
    return {
      openDeals: openDeals.length,
      openValue,
    }
  }, [deals])

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Opportunities</h1>
          <p className="text-sm text-muted-foreground">
            Active prospects who have raised their hand to buy soon.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => setAddOpportunityOpen(true)}>
            <Plus className="h-4 w-4" />
            Add From Contacts
          </Button>
          <div className="rounded-md border border-border/70 bg-card px-4 py-3 text-sm shadow-sm">
            <p className="font-medium">{stats.openDeals} open opportunities</p>
            <p className="text-muted-foreground">{formatCurrency(stats.openValue)} still in play</p>
          </div>
        </div>
      </div>

      <KanbanBoard onCardClick={(leadId) => setOpenLeadId(leadId)} />
      <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      <AddOpportunityDialog
        open={addOpportunityOpen}
        onOpenChange={setAddOpportunityOpen}
        onCreated={(leadId) => setOpenLeadId(leadId)}
      />
    </div>
  )
}
