import { Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DrivingLead } from '@/types/property';

type D4dKanbanCardProps = {
  lead: DrivingLead;
  onViewDetails?: (lead: DrivingLead) => void;
};

export function D4dKanbanCard({ lead, onViewDetails }: D4dKanbanCardProps) {
  return (
    <div className="w-full rounded-md border border-border/70 bg-card p-3 text-left shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{lead.street || lead.rawAddress}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{lead.city}, {lead.state}</p>
        </div>
        {onViewDetails && (
          <button
            type="button"
            aria-label="View details"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            onClick={() => onViewDetails(lead)}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {lead.notes && <p className="mt-1.5 text-xs italic text-muted-foreground line-clamp-2">{lead.notes}</p>}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Added {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
      </p>
    </div>
  );
}
