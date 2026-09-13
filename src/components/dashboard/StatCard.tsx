import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    direction: 'up' | 'down';
    label: string;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
}

const variantStyles = {
  default: 'border-border',
  primary: 'border-primary/30 bg-primary/5',
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  danger: 'border-judgment/30 bg-judgment/5',
};

const iconCircleStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-judgment/15 text-judgment',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  onClick,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'stat-card animate-fade-in',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02]'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        {Icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-full', iconCircleStyles[variant])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-semibold font-mono tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        {trend && (
          <div className={cn(
            'text-xs font-medium px-2 py-1 rounded-full',
            trend.direction === 'up'
              ? 'bg-success/20 text-success'
              : 'bg-judgment/20 text-judgment'
          )}>
            {trend.direction === 'up' ? '▲' : '▼'} {trend.label}
          </div>
        )}
      </div>
    </div>
  );
}
