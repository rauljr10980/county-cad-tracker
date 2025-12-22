import { Building2, TrendingUp, AlertTriangle, Plus, Minus, Gavel, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyStatus } from '@/types/property';
import { useDashboardStats } from '@/hooks/useFiles';

interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
}

export function Dashboard({ onFilterChange }: DashboardProps) {
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();

  const isLoading = statsLoading;
  const error = statsError;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">Failed to load dashboard data</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="p-6">
        <div className="p-12 text-center">
          <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Properties"
          value={stats.totalProperties}
          subtitle="In current dataset"
          icon={Building2}
          variant="primary"
        />
        <StatCard
          title="New This Month"
          value={stats.newThisMonth}
          icon={Plus}
          variant="success"
          trend={{ value: stats.newThisMonth, label: 'new', isPositive: true }}
        />
        <StatCard
          title="Dead Leads"
          value={stats.deadLeads}
          subtitle="Foreclosed properties"
          icon={Minus}
          variant="danger"
        />
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard
          title="Judgment"
          value={stats.byStatus.judgment}
          subtitle={`${((stats.byStatus.judgment / stats.totalProperties) * 100).toFixed(1)}% of total`}
          icon={Gavel}
          variant="danger"
        />
        <StatCard
          title="Active"
          value={stats.byStatus.active}
          subtitle={`${((stats.byStatus.active / stats.totalProperties) * 100).toFixed(1)}% of total`}
          icon={CheckCircle}
          variant="success"
        />
        <StatCard
          title="Pending"
          value={stats.byStatus.pending}
          subtitle={`${((stats.byStatus.pending / stats.totalProperties) * 100).toFixed(1)}% of total`}
          icon={Clock}
          variant="warning"
        />
      </div>

    </div>
  );
}
