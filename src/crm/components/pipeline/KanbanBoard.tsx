import { useMemo, useState } from 'react'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSearchStore } from '@/crm/lib/searchStore'
import { PIPELINE_STAGES, type Deal, type PipelineStage } from '@/crm/data/types'
import { formatCurrency } from '@/crm/lib/utils'
import { useCrmStore } from '@/crm/store/useCrmStore'
import { KanbanCard } from './KanbanCard'

type KanbanBoardProps = {
  onCardClick: (leadId: string) => void
}

type CloseWonDraft = {
  deal: Deal
  value: number
} | null

export function KanbanBoard({ onCardClick }: KanbanBoardProps) {
  const deals = useCrmStore((state) => state.deals)
  const leads = useCrmStore((state) => state.leads)
  const moveDealStage = useCrmStore((state) => state.moveDealStage)
  const updateDeal = useCrmStore((state) => state.updateDeal)
  const setLeadKind = useCrmStore((state) => state.setLeadKind)
  const query = useSearchStore((state) => state.query).trim().toLowerCase()
  const [closeWonDraft, setCloseWonDraft] = useState<CloseWonDraft>(null)

  const promptMoveToRetail = (leadId: string) => {
    if (window.confirm('Move this contact to Retail for ongoing nurture?')) {
      setLeadKind(leadId, 'retail')
    }
  }

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])

  const visibleDeals = useMemo(() => {
    if (!query) return deals
    return deals.filter((deal) => {
      const lead = leadById.get(deal.leadId)
      return `${lead?.businessName ?? ''} ${lead?.ownerName ?? ''} ${lead?.city ?? ''}`
        .toLowerCase()
        .includes(query)
    })
  }, [leadById, deals, query])

  const dealsByStage = useMemo(() => {
    const groups = new Map<PipelineStage, Deal[]>()
    for (const stage of PIPELINE_STAGES) {
      groups.set(stage, [])
    }
    for (const deal of visibleDeals) {
      groups.get(deal.stage)?.push(deal)
    }
    return groups
  }, [visibleDeals])

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const nextStage = result.destination.droppableId as PipelineStage
    const deal = deals.find((entry) => entry.id === result.draggableId)
    if (!deal || deal.stage === nextStage) return

    if (nextStage === 'Closed Won') {
      setCloseWonDraft({ deal, value: deal.value })
      return
    }

    moveDealStage(deal.id, nextStage)
    if (nextStage === 'Archived') {
      promptMoveToRetail(deal.leadId)
    }
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => {
            const stageDeals = dealsByStage.get(stage) ?? []
            const totalValue = stageDeals.reduce((sum, deal) => sum + deal.value, 0)

            return (
              <Droppable key={stage} droppableId={stage}>
                {(provided, snapshot) => (
                  <section
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`w-[290px] shrink-0 rounded-md border border-border/70 bg-card p-3 shadow-sm transition ${
                      snapshot.isDraggingOver ? 'border-primary/50 bg-accent/20' : ''
                    }`}
                  >
                    <div className="mb-3 rounded-md bg-muted/50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">{stage}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {stageDeals.length} opportunities
                          </p>
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">
                          {formatCurrency(totalValue)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {stageDeals.map((deal, index) => (
                        <Draggable key={deal.id} draggableId={deal.id} index={index}>
                          {(dragProvided) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                            >
                              <KanbanCard
                                deal={deal}
                                lead={leadById.get(deal.leadId)}
                                onClick={() => onCardClick(deal.leadId)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {stageDeals.length === 0 ? (
                        <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                          No active prospects here.
                        </div>
                      ) : null}
                      {provided.placeholder}
                    </div>
                  </section>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      <Dialog
        open={Boolean(closeWonDraft)}
        onOpenChange={(open) => {
          if (!open) setCloseWonDraft(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Closed Won</DialogTitle>
            <DialogDescription>
              Capture the final value before moving this opportunity into revenue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Final opportunity value</label>
            <Input
              type="number"
              value={closeWonDraft?.value ?? 0}
              onChange={(event) =>
                setCloseWonDraft((current) =>
                  current
                    ? {
                        ...current,
                        value: Number(event.target.value) || 0,
                      }
                    : null,
                )
              }
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseWonDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!closeWonDraft) return
                const { deal: closingDeal, value } = closeWonDraft
                updateDeal(closingDeal.id, { value, probability: 100 })
                moveDealStage(closingDeal.id, 'Closed Won')
                setCloseWonDraft(null)
                promptMoveToRetail(closingDeal.leadId)
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
