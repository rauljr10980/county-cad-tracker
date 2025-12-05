import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean;
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

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  variant = 'default',
  onClick 
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
          <Icon className={cn(
            'h-4 w-4',
            variant === 'primary' && 'text-primary',
            variant === 'success' && 'text-success',
            variant === 'warning' && 'text-warning',
            variant === 'danger' && 'text-judgment'
          )} />
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
            'text-xs font-medium px-2 py-1 rounded',
            trend.isPositive 
              ? 'bg-success/20 text-success' 
              : 'bg-judgment/20 text-judgment'
          )}>
            {trend.isPositive ? '+' : ''}{trend.value} {trend.label}
          </div>
        )}
      </div>
    </div>
  );
}
