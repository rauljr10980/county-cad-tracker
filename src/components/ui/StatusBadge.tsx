import { cn } from '@/lib/utils';
import { PropertyStatus } from '@/types/property';

interface StatusBadgeProps {
  status: PropertyStatus;
  size?: 'sm' | 'md';
}

const statusConfig = {
  J: { label: 'Judgment', className: 'status-judgment' },
  A: { label: 'Active', className: 'status-active' },
  P: { label: 'Pending', className: 'status-pending' },
  F: { label: 'Foreclosed', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  D: { label: 'Dead Lead', className: 'bg-muted text-muted-foreground border-muted-foreground/20' },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span 
      className={cn(
        'status-badge font-mono',
        config.className,
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
      )}
    >
      {config.label}
    </span>
  );
}

interface StatusTransitionBadgeProps {
  from: PropertyStatus;
  to: PropertyStatus;
  count?: number;
  onClick?: () => void;
}

export function StatusTransitionBadge({ from, to, count, onClick }: StatusTransitionBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="transition-card bg-secondary hover:bg-secondary/80 flex items-center gap-1"
    >
      <StatusBadge status={from} size="sm" />
      <span className="text-muted-foreground">→</span>
      <StatusBadge status={to} size="sm" />
      {count !== undefined && (
        <span className="ml-1 text-muted-foreground">({count})</span>
      )}
    </button>
  );
}
