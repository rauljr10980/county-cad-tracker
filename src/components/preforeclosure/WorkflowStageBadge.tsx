import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorkflowStage } from '@/types/property';
import { WORKFLOW_STAGES } from '@/types/property';

interface WorkflowStageBadgeProps {
  stage: WorkflowStage;
  isUnderwater?: boolean;
  className?: string;
}

// Groups the pipeline's 12 granular stages into 4 display colors: a fresh
// lead (blue), early discovery work (purple), active engagement (amber),
// plus the two terminal outcomes (green for an offer out, red for dead).
const STAGE_COLOR_CLASS: Record<WorkflowStage, string> = {
  not_started: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  initial_visit: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  waiting_to_be_contacted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  people_search: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  land_records: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  call_owner: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  visit_heirs: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  call_heirs: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  negotiating: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  comps: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  sent_offer: 'bg-green-500/20 text-green-400 border-green-500/30',
  dead_end: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function WorkflowStageBadge({ stage, isUnderwater, className }: WorkflowStageBadgeProps) {
  if (isUnderwater) {
    return (
      <Badge variant="outline" className={cn('bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs whitespace-nowrap', className)}>
        Underwater
      </Badge>
    );
  }

  const meta = WORKFLOW_STAGES[stage] || WORKFLOW_STAGES.not_started;
  const colorClass = STAGE_COLOR_CLASS[stage] ?? STAGE_COLOR_CLASS.not_started;

  return (
    <Badge variant="outline" className={cn(colorClass, 'text-xs whitespace-nowrap', className)}>
      {meta.shortLabel}
    </Badge>
  );
}
