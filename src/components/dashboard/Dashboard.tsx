import { Building2, DollarSign, TrendingUp, AlertTriangle, Plus, Minus, ArrowRightLeft, Gavel, CheckCircle, Clock } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { mockDashboardStats, mockStatusTransitions, mockComparisonReport } from '@/data/mockData';
import { PropertyStatus } from '@/types/property';

interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
}

export function Dashboard({ onFilterChange }: DashboardProps) {
  const stats = mockDashboardStats;
  const transitions = mockStatusTransitions;
  const comparison = mockComparisonReport;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Properties"
          value={stats.totalProperties}
          subtitle="In current dataset"
          icon={Building2}
          variant="primary"
        />
        <StatCard
          title="Total Amount Due"
          value={formatCurrency(stats.totalAmountDue)}
          subtitle={`Avg: ${formatCurrency(stats.avgAmountDue)}`}
          icon={DollarSign}
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

      {/* Comparison Summary */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              Monthly Comparison
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {comparison.currentFile} vs {comparison.previousFile}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-secondary/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">New Properties</p>
            <p className="text-xl font-semibold font-mono text-success">
              +{comparison.summary.newProperties.toLocaleString()}
            </p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Removed</p>
            <p className="text-xl font-semibold font-mono text-judgment">
              -{comparison.summary.removedProperties.toLocaleString()}
            </p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Status Changes</p>
            <p className="text-xl font-semibold font-mono text-warning">
              {comparison.summary.statusChanges.toLocaleString()}
            </p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Net Change</p>
            <p className="text-xl font-semibold font-mono">
              {(comparison.summary.totalCurrent - comparison.summary.totalPrevious).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Status Transitions */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Status Transitions</h3>
          <div className="flex flex-wrap gap-2">
            {transitions.map((transition, index) => (
              <StatusTransitionBadge
                key={index}
                from={transition.from}
                to={transition.to}
                count={transition.count}
                onClick={() => onFilterChange?.({ from: transition.from, to: transition.to })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-warning">Attention Required</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {comparison.summary.statusChanges} properties changed status this month. 
              Review the transitions above to identify potential opportunities or risks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
