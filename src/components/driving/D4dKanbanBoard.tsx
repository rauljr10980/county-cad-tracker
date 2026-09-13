import { useMemo } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useUpdateDrivingLead } from '@/hooks/useDrivingLeads';
import type { DrivingLead, DrivingLeadStatus } from '@/types/property';
import { D4dKanbanCard } from './D4dKanbanCard';

type BoardStage = { key: DrivingLeadStatus; label: string };

const BOARD_STAGES: BoardStage[] = [
  { key: 'NEW', label: 'Leads' },
  { key: 'RESEARCHING', label: 'Researching' },
  { key: 'FOUND_OBITUARY', label: 'Found Obituary' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract' },
  { key: 'DEAD', label: 'Dead Deal' },
];

type D4dKanbanBoardProps = {
  leads: DrivingLead[];
  onViewDetails?: (lead: DrivingLead) => void;
};

export function D4dKanbanBoard({ leads, onViewDetails }: D4dKanbanBoardProps) {
  const updateMutation = useUpdateDrivingLead();

  const leadsByStage = useMemo(() => {
    const groups = new Map<DrivingLeadStatus, DrivingLead[]>();
    for (const stage of BOARD_STAGES) groups.set(stage.key, []);
    for (const lead of leads) groups.get(lead.status)?.push(lead);
    return groups;
  }, [leads]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const nextStatus = result.destination.droppableId as DrivingLeadStatus;
    const lead = leads.find((l) => l.id === result.draggableId);
    if (!lead || lead.status === nextStatus) return;
    updateMutation.mutate({ id: lead.id, status: nextStatus });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {BOARD_STAGES.map((stage) => {
          const stageLeads = leadsByStage.get(stage.key) ?? [];
          return (
            <Droppable key={stage.key} droppableId={stage.key}>
              {(provided, snapshot) => (
                <section
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`w-[290px] shrink-0 rounded-md border border-border/70 bg-card p-3 shadow-sm transition ${
                    snapshot.isDraggingOver ? 'border-primary/50 bg-accent/20' : ''
                  }`}
                >
                  <div className="mb-3 rounded-md bg-muted/50 p-3">
                    <h3 className="text-sm font-semibold">{stage.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{stageLeads.length} leads</p>
                  </div>

                  <div className="space-y-3">
                    {stageLeads.map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(dragProvided) => (
                          <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}>
                            <D4dKanbanCard lead={lead} onViewDetails={onViewDetails} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                        No leads in this stage.
                      </div>
                    )}
                    {provided.placeholder}
                  </div>
                </section>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
