import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorkflowStage } from '@/types/property';
import { WORKFLOW_STAGES } from '@/types/property';

interface WorkflowStageBadgeProps {
  stage: WorkflowStage;
  className?: string;
}

export function WorkflowStageBadge({ stage, className }: WorkflowStageBadgeProps) {
  const meta = WORKFLOW_STAGES[stage] || WORKFLOW_STAGES.not_started;

  const colorClass =
    stage === 'not_started'
      ? 'bg-muted text-muted-foreground'
      : stage === 'sent_offer'
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : stage === 'dead_end'
          ? 'bg-red-500/20 text-red-400 border-red-500/30'
          : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

  return (
    <Badge variant="outline" className={cn(colorClass, 'text-xs whitespace-nowrap', className)}>
      {meta.shortLabel}
    </Badge>
  );
}
