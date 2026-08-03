import { useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { STAGES } from '../constants';
import { patchLead } from '../api/evictionsCrm';
import { StageColumn } from './StageColumn';

export function PipelinePage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = async (event: DragEndEvent) => {
    const leadId = String(event.active.id);
    const targetStage = event.over ? String(event.over.id) : '';
    if (!targetStage) return;

    try {
      await patchLead(leadId, { contactStage: targetStage });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move lead');
    }
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Drag a lead to change its stage</p>
      </div>
      {error && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto flex-1 pb-2">
          {STAGES.map((stage) => <StageColumn key={stage} stage={stage} reloadKey={reloadKey} />)}
        </div>
      </DndContext>
    </div>
  );
}
