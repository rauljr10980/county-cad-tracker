import { Building2, TrendingUp, TrendingDown, AlertTriangle, Plus, Minus, Gavel, CheckCircle, Clock, Loader2, Users, DollarSign, Package, ShoppingCart, Target, TrendingUp as Pipeline } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyStatus } from '@/types/property';
import { useDashboardStats } from '@/hooks/useFiles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

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

  return (
    <div className="p-6 space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Funnel Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Funnel</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Current pipeline snapshot</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { stage: 'New Leads', count: pipelineData.byStage.new_lead, color: '#3B82F6', width: 100 },
                { stage: 'Contacted', count: pipelineData.byStage.contacted, color: '#8B5CF6', width: 85 },
                { stage: 'Interested', count: pipelineData.byStage.interested, color: '#EC4899', width: 70 },
                { stage: 'Offer Sent', count: pipelineData.byStage.offer_sent, color: '#F59E0B', width: 55 },
                { stage: 'Negotiating', count: pipelineData.byStage.negotiating, color: '#EF4444', width: 40 },
                { stage: 'Under Contract', count: pipelineData.byStage.under_contract, color: '#10B981', width: 25 },
                { stage: 'Closed', count: pipelineData.byStage.closed, color: '#059669', width: 15 },
              ].map((item, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.stage}</span>
                    <span className="text-muted-foreground">{item.count.toLocaleString()} leads</span>
                  </div>
                  <div className="relative w-full h-8 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full flex items-center justify-center text-white font-semibold text-sm transition-all duration-300"
                      style={{
                        backgroundColor: item.color,
                        width: `${item.width}%`,
                      }}
                    >
                      {item.width > 20 && `${item.count.toLocaleString()}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-gray-400" />
                  <span className="text-muted-foreground">Dead Leads</span>
                </div>
                <span className="font-medium text-muted-foreground">
                  {pipelineData.byStage.dead.toLocaleString()} leads
                </span>
              </div>
            </div>
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
