import { useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { STAGES } from '../constants';
import { patchLead } from '../api/evictionsCrm';
import { StageColumn } from './StageColumn';
import { ErrorBanner } from '../components/ErrorBanner';

const initialReloadKeys = (): Record<string, number> =>
  Object.fromEntries(STAGES.map((stage) => [stage, 0]));

export function PipelinePage() {
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>(initialReloadKeys);
  const [error, setError] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = async (event: DragEndEvent) => {
    const leadId = String(event.active.id);
    const sourceStage = (event.active.data.current as { stage?: string } | undefined)?.stage;
    const targetStage = event.over ? String(event.over.id) : '';
    if (!targetStage) return;
    // Guard against a missing/unrecognized source stage rather than silently bumping a
    // reload key no column watches, which would leave the source column stuck stale.
    if (!sourceStage || !(STAGES as readonly string[]).includes(sourceStage)) return;
    if (targetStage === sourceStage) return;

    try {
      await patchLead(leadId, { contactStage: targetStage });
      setReloadKeys((prev) => ({
        ...prev,
        [sourceStage]: (prev[sourceStage] ?? 0) + 1,
        [targetStage]: (prev[targetStage] ?? 0) + 1,
      }));
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
      {error && <ErrorBanner message={error} className="mb-3" />}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto flex-1 pb-2">
          {STAGES.map((stage) => (
            <StageColumn key={stage} stage={stage} reloadKey={reloadKeys[stage] ?? 0} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
