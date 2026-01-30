import { useState, useMemo } from 'react';
import { Building2, TrendingUp, TrendingDown, AlertTriangle, Plus, Minus, Gavel, CheckCircle, Clock, Loader2, Users, DollarSign, Package, ShoppingCart, Target, TrendingUp as Pipeline } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyStatus } from '@/types/property';
import { useDashboardStats } from '@/hooks/useFiles';
import { usePreForeclosures } from '@/hooks/usePreForeclosure';
import type { WorkflowStage } from '@/types/property';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
}

export function Dashboard({ onFilterChange }: DashboardProps) {
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: preForeclosureRecords, isLoading: isLoadingPreForeclosures } = usePreForeclosures();

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

  // Ensure stats has required fields
  const safeStats = {
    totalProperties: stats?.totalProperties || 0,
    byStatus: stats?.byStatus || { judgment: 0, active: 0, pending: 0 },
    totalAmountDue: stats?.totalAmountDue || 0,
    avgAmountDue: stats?.avgAmountDue || 0,
    newThisMonth: stats?.newThisMonth || 0,
    removedThisMonth: stats?.removedThisMonth || 0,
    deadLeads: stats?.deadLeads || 0,
    amountDueDistribution: stats?.amountDueDistribution || [],
    pipeline: stats?.pipeline,
    tasks: stats?.tasks,
  };

  // Status distribution data (from PostgreSQL)
  const statusData = [
    { name: 'Judgment (J)', value: safeStats.byStatus.judgment || 0, color: '#EF4444', percentage: safeStats.totalProperties > 0 ? ((safeStats.byStatus.judgment || 0) / safeStats.totalProperties * 100).toFixed(1) : '0.0' },
    { name: 'Active (A)', value: safeStats.byStatus.active || 0, color: '#10B981', percentage: safeStats.totalProperties > 0 ? ((safeStats.byStatus.active || 0) / safeStats.totalProperties * 100).toFixed(1) : '0.0' },
    { name: 'Pending (P)', value: safeStats.byStatus.pending || 0, color: '#F59E0B', percentage: safeStats.totalProperties > 0 ? ((safeStats.byStatus.pending || 0) / safeStats.totalProperties * 100).toFixed(1) : '0.0' },
  ];

  // Amount due ranges from PostgreSQL data
  const amountRanges = safeStats.amountDueDistribution.length > 0 ? safeStats.amountDueDistribution : [
    { range: '$0-$5K', count: 0, color: '#3B82F6' },
    { range: '$5K-$10K', count: 0, color: '#8B5CF6' },
    { range: '$10K-$25K', count: 0, color: '#EC4899' },
    { range: '$25K-$50K', count: 0, color: '#F59E0B' },
    { range: '$50K+', count: 0, color: '#EF4444' },
  ];

  // Use pipeline data from API (PostgreSQL)
  const pipelineData = safeStats.pipeline || {
    totalValue: 0,
    activeDeals: 0,
    byStage: {},
    conversionRate: 0,
    avgDealValue: 0,
  };
  
  // Ensure conversionRate is a number
  const conversionRate = typeof pipelineData.conversionRate === 'number' 
    ? pipelineData.conversionRate 
    : parseFloat(String(pipelineData.conversionRate || 0)) || 0;

  // Workflow stage funnel data (using pre-foreclosure workflow stages)
  const SALES_FUNNEL_STAGES: { key: WorkflowStage; label: string; color: string }[] = [
    { key: 'not_started', label: 'Not Started', color: '#6B7280' }, // Gray
    { key: 'initial_visit', label: 'Visit', color: '#3B82F6' }, // Blue
    { key: 'people_search', label: 'Search', color: '#8B5CF6' }, // Purple
    { key: 'call_owner', label: 'Call', color: '#EC4899' }, // Pink
    { key: 'land_records', label: 'Records', color: '#F59E0B' }, // Orange
    { key: 'visit_heirs', label: 'Visit Heirs', color: '#F97316' }, // Orange-red
    { key: 'call_heirs', label: 'Call Heirs', color: '#EF4444' }, // Red
    { key: 'negotiating', label: 'Negotiating', color: '#10B981' }, // Green
  ];

  // Calculate workflow stage counts from pre-foreclosure records
  const workflowStageCounts = useMemo(() => {
    const records = preForeclosureRecords || [];
    console.log('[Dashboard] Calculating workflow stage counts from', records.length, 'pre-foreclosure records');
    
    const counts: Record<WorkflowStage, number> = {
      not_started: 0,
      initial_visit: 0,
      people_search: 0,
      call_owner: 0,
      land_records: 0,
      visit_heirs: 0,
      call_heirs: 0,
      negotiating: 0,
      dead_end: 0,
    };

    // Debug: log sample records to see structure
    if (records.length > 0) {
      console.log('[Dashboard] Sample record:', {
        document_number: records[0].document_number,
        workflow_stage: records[0].workflow_stage,
        hasWorkflowStage: 'workflow_stage' in records[0],
        keys: Object.keys(records[0])
      });
    }

    for (const r of records) {
      // Try both snake_case and camelCase
      const stage = (r.workflow_stage || (r as any).workflowStage || 'not_started') as WorkflowStage;
      if (stage in counts) {
        counts[stage]++;
      } else {
        console.warn('[Dashboard] Unknown workflow stage:', stage, 'in record:', r.document_number);
      }
    }

    console.log('[Dashboard] Workflow stage counts:', counts);
    return counts;
  }, [preForeclosureRecords]);

  const maxWorkflowStageCount = useMemo(() => {
    const activeStages = SALES_FUNNEL_STAGES.map(s => workflowStageCounts[s.key]);
    return Math.max(1, ...activeStages);
  }, [workflowStageCounts]);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Properties
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeStats.totalProperties.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tax delinquent properties
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount Due
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(safeStats.totalAmountDue / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: ${safeStats.avgAmountDue.toLocaleString()} per property
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              New This Month
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeStats.newThisMonth.toLocaleString()}</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <Plus className="h-3 w-3" />
              New delinquencies added
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resolved/Removed
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeStats.deadLeads.toLocaleString()}</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <Minus className="h-3 w-3" />
              Properties resolved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trends Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Monthly Delinquency Trends</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Track new delinquencies and resolutions over time</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]" />
                <span className="text-sm text-muted-foreground">New Delinquencies</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#10B981]" />
                <span className="text-sm text-muted-foreground">Resolved</span>
              </div>
            </div>
          </div>
        </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <p>Monthly trends chart will be available when historical data is tracked.</p>
              <p className="text-sm mt-2">New this month: {safeStats.newThisMonth || 0} | Removed this month: {safeStats.removedThisMonth || 0}</p>
            </div>
          </CardContent>
      </Card>

      {/* Bottom Row - Status Distribution, Amount Ranges, and Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Property Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Property Status Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Breakdown by delinquency status</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className="w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full space-y-2 mt-4">
                {statusData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="font-medium">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Amount Due Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Amount Due Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Properties grouped by tax debt amount</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {amountRanges.map((range, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: range.color }} />
                      <span className="text-muted-foreground">{range.range}</span>
                    </div>
                    <span className="font-medium">{range.count.toLocaleString()} properties</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        backgroundColor: range.color,
                        width: `${safeStats.totalProperties > 0 ? (range.count / safeStats.totalProperties) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tasks & Actions Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks & Actions</CardTitle>
            <p className="text-sm text-muted-foreground">Active follow-ups and pending actions</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: 'Total Tasks', count: safeStats.tasks?.total || 0, color: '#3B82F6', icon: '📋' },
                { action: 'Luciano', count: safeStats.tasks?.luciano || 0, color: '#10B981', icon: '👤' },
                { action: 'Raul', count: safeStats.tasks?.raul || 0, color: '#F59E0B', icon: '👤' },
              ].map((task, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{task.icon}</span>
                      <span className="text-muted-foreground">{task.action}</span>
                    </div>
                    <span className="font-bold" style={{ color: task.color }}>
                      {task.count}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        backgroundColor: task.color,
                        width: `${Math.min((task.count / Math.max(safeStats.tasks?.total || 1, 1)) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline/Deals Tracking Section */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Sales Pipeline & Deal Tracking</h3>
      </div>

      {/* Pipeline Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pipeline Value
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${(pipelineData.totalValue / 1000000).toFixed(2)}M
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total estimated value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Deals
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pipelineData.activeDeals}</div>
            <p className="text-xs text-muted-foreground mt-1">
              In progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Deal Value
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${pipelineData.avgDealValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per property
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conversion Rate
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lead to close
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Funnel and Pipeline Progression Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Sales Funnel Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Funnel</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Current pipeline snapshot</p>
          </CardHeader>
          <CardContent>
            {isLoadingPreForeclosures ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Loading pipeline data...</span>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {SALES_FUNNEL_STAGES.map((stage) => {
                    const count = workflowStageCounts[stage.key] || 0;
                    const width = maxWorkflowStageCount > 0 
                      ? Math.max(count > 0 ? 5 : 0, (count / maxWorkflowStageCount) * 100) 
                      : 0;
                    const showNumberInside = width > 20;
                    return (
                      <div key={stage.key} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{stage.label}</span>
                          <span className="text-muted-foreground">{count.toLocaleString()} {count === 1 ? 'deal' : 'deals'}</span>
                        </div>
                        <div className="relative w-full h-8 bg-gray-100 rounded-lg overflow-hidden">
                          {count > 0 ? (
                            <div
                              className="h-full flex items-center justify-center text-white font-semibold text-sm transition-all duration-300"
                              style={{
                                backgroundColor: stage.color,
                                width: `${width}%`,
                                minWidth: count > 0 ? '5%' : '0%',
                              }}
                            >
                              {showNumberInside ? count.toLocaleString() : ''}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center bg-gray-50">
                              <span className="text-xs text-muted-foreground">0</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {workflowStageCounts.dead_end > 0 && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gray-400" />
                        <span className="text-muted-foreground">Dead End</span>
                      </div>
                      <span className="font-medium text-muted-foreground">
                        {workflowStageCounts.dead_end.toLocaleString()} deals
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Progression Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Progression</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Track deal stages over time</p>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <p>Pipeline progression chart will be available when historical data is tracked.</p>
              <p className="text-sm mt-2">Current active deals: {pipelineData.activeDeals || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
