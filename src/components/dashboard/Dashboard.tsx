import { Building2, DollarSign, TrendingUp, AlertTriangle, Plus, Minus, ArrowRightLeft, Gavel, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyStatus } from '@/types/property';
import { useDashboardStats, useLatestComparison } from '@/hooks/useFiles';

interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
}

export function Dashboard({ onFilterChange }: DashboardProps) {
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: comparison, isLoading: comparisonLoading, error: comparisonError } = useLatestComparison();

  const isLoading = statsLoading || comparisonLoading;
  const error = statsError || comparisonError;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

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

  const transitions = comparison?.statusTransitions || [];

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
      {comparison ? (
        <>
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

            {/* Status Transitions - Detailed */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Status Transitions</h3>
              {transitions.length > 0 ? (
                <div className="space-y-3">
                  {/* Transition Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
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
                  
                  {/* Detailed Transition Table */}
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                      Transition Breakdown
                    </h4>
                    <div className="space-y-2">
                      {transitions.map((transition, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <StatusTransitionBadge
                              from={transition.from}
                              to={transition.to}
                              count={transition.count}
                            />
                            <span className="text-xs text-muted-foreground">
                              {transition.from === 'P' ? 'Pending' : transition.from === 'A' ? 'Active' : transition.from === 'J' ? 'Judgment' : 'Unknown'} 
                              {' → '}
                              {transition.to === 'P' ? 'Pending' : transition.to === 'A' ? 'Active' : transition.to === 'J' ? 'Judgment' : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold font-mono">
                              {transition.count.toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground">properties</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        Total properties with status changes: <span className="font-semibold text-foreground">{comparison.summary.statusChanges.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No status transitions found</p>
              )}
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
        </>
      ) : (
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <ArrowRightLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          {comparisonLoading ? (
            <>
              <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">Generating comparison...</p>
              <p className="text-sm text-muted-foreground mt-2">This may take a moment</p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">No comparison data available</p>
              <p className="text-sm text-muted-foreground mt-2">Upload at least two files to see comparisons</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
