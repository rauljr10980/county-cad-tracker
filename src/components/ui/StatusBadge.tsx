import { cn } from '@/lib/utils';
import { PropertyStatus } from '@/types/property';

interface StatusBadgeProps {
  status: PropertyStatus | string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { label: string; className: string }> = {
  J: { label: 'Judgment', className: 'status-judgment' },
  A: { label: 'Active', className: 'status-active' },
  P: { label: 'Pending', className: 'status-pending' },
};

// Default config for unknown statuses
const defaultConfig = { label: 'Unknown', className: 'bg-gray-500/20 text-gray-400' };

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  // Safely get config with fallback for invalid/unknown statuses
  const config = statusConfig[status] || defaultConfig;
  
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
