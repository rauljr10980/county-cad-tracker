import { cn } from '@/lib/utils';
import { QUEUES, type QueueId } from './queues';
import type { PipelineCounts } from '../types/crm';

/**
 * The counts are the point of this strip: they say where the work is before
 * anything is clicked. Overdue carries the one non-greyscale treatment, because
 * it is the only queue that means "you are late".
 */
export function QueueTabs({
  active,
  counts,
  onChange,
}: {
  active: QueueId;
  counts: PipelineCounts | null;
  onChange: (queue: QueueId) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Work queues">
      {QUEUES.map((q) => {
        const isActive = active === q.id;
        const count = counts ? counts[q.id] : null;
        const isOverdue = q.id === 'overdue' && (count ?? 0) > 0;
        return (
          <button
            key={q.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(q.id)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              isActive
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
              isOverdue && !isActive && 'text-destructive'
            )}
          >
            {q.label}
            {count !== null && <span className="record text-xs text-muted-foreground">{count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}
