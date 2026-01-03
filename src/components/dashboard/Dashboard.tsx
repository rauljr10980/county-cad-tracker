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

  // Monthly tracking data (simulated - you can connect to real API data)
  const monthlyTrendsData = [
    { month: 'Jun', totalProperties: 56234, newDelinquencies: 892, resolved: 445 },
    { month: 'Jul', totalProperties: 56681, newDelinquencies: 1043, resolved: 596 },
    { month: 'Aug', totalProperties: 57128, newDelinquencies: 978, resolved: 531 },
    { month: 'Sep', totalProperties: 57575, newDelinquencies: 1124, resolved: 677 },
    { month: 'Oct', totalProperties: 57234, newDelinquencies: 756, resolved: 1097 },
    { month: 'Nov', totalProperties: 57891, newDelinquencies: 1289, resolved: 632 },
    { month: 'Dec', totalProperties: 58432, newDelinquencies: 1243, resolved: 702 },
  ];

  // Status distribution data
  const statusData = [
    { name: 'Judgment (J)', value: stats.byStatus.judgment, color: '#EF4444', percentage: ((stats.byStatus.judgment / stats.totalProperties) * 100).toFixed(1) },
    { name: 'Active (A)', value: stats.byStatus.active, color: '#10B981', percentage: ((stats.byStatus.active / stats.totalProperties) * 100).toFixed(1) },
    { name: 'Pending (P)', value: stats.byStatus.pending, color: '#F59E0B', percentage: ((stats.byStatus.pending / stats.totalProperties) * 100).toFixed(1) },
  ];

  // Amount due ranges for distribution
  const amountRanges = [
    { range: '$0-$5K', count: Math.floor(stats.totalProperties * 0.25), color: '#3B82F6' },
    { range: '$5K-$10K', count: Math.floor(stats.totalProperties * 0.30), color: '#8B5CF6' },
    { range: '$10K-$25K', count: Math.floor(stats.totalProperties * 0.25), color: '#EC4899' },
    { range: '$25K-$50K', count: Math.floor(stats.totalProperties * 0.12), color: '#F59E0B' },
    { range: '$50K+', count: Math.floor(stats.totalProperties * 0.08), color: '#EF4444' },
  ];

  // Pipeline progression over time (simulated - you can connect to real API data)
  const pipelineProgressionData = [
    { month: 'Jun', interested: 198, offer_sent: 67, negotiating: 34, under_contract: 18, closed: 112 },
    { month: 'Jul', interested: 212, offer_sent: 73, negotiating: 38, under_contract: 21, closed: 128 },
    { month: 'Aug', interested: 224, offer_sent: 78, negotiating: 41, under_contract: 19, closed: 134 },
    { month: 'Sep', interested: 219, offer_sent: 81, negotiating: 42, under_contract: 22, closed: 141 },
    { month: 'Oct', interested: 228, offer_sent: 85, negotiating: 44, under_contract: 20, closed: 149 },
    { month: 'Nov', interested: 231, offer_sent: 87, negotiating: 43, under_contract: 24, closed: 153 },
    { month: 'Dec', interested: 234, offer_sent: 89, negotiating: 45, under_contract: 23, closed: 156 },
  ];

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
            <div className="text-2xl font-bold">{stats.totalProperties.toLocaleString()}</div>
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
            <div className="text-2xl font-bold">${(stats.totalAmountDue / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: ${stats.avgAmountDue.toLocaleString()} per property
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
            <div className="text-2xl font-bold">{stats.newThisMonth.toLocaleString()}</div>
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
            <div className="text-2xl font-bold">{stats.deadLeads.toLocaleString()}</div>
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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTrendsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="newDelinquencies" fill="#EF4444" radius={[4, 4, 0, 0]} name="New Delinquencies" />
              <Bar dataKey="resolved" fill="#10B981" radius={[4, 4, 0, 0]} name="Resolved" />
            </BarChart>
          </ResponsiveContainer>
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
                        width: `${(range.count / stats.totalProperties) * 100}%`
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
                { action: 'Calls Due Today', count: 45, color: '#EF4444', icon: '📞' },
                { action: 'Follow-ups This Week', count: 128, color: '#F59E0B', icon: '📅' },
                { action: 'Texts Scheduled', count: 67, color: '#8B5CF6', icon: '💬' },
                { action: 'Mail Campaign Active', count: 234, color: '#3B82F6', icon: '✉️' },
                { action: 'Drive-bys Planned', count: 12, color: '#10B981', icon: '🚗' },
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
                        width: `${Math.min((task.count / 250) * 100, 100)}%`
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
      {stats.pipeline && (
        <>
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
                  ${(stats.pipeline.totalValue / 1000000).toFixed(2)}M
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
                <div className="text-2xl font-bold">{stats.pipeline.activeDeals}</div>
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
                  ${stats.pipeline.avgDealValue.toLocaleString()}
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
                  {stats.pipeline.conversionRate}%
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
                    { stage: 'New Leads', count: stats.pipeline.byStage.new_lead, color: '#3B82F6', width: 100 },
                    { stage: 'Contacted', count: stats.pipeline.byStage.contacted, color: '#8B5CF6', width: 85 },
                    { stage: 'Interested', count: stats.pipeline.byStage.interested, color: '#EC4899', width: 70 },
                    { stage: 'Offer Sent', count: stats.pipeline.byStage.offer_sent, color: '#F59E0B', width: 55 },
                    { stage: 'Negotiating', count: stats.pipeline.byStage.negotiating, color: '#EF4444', width: 40 },
                    { stage: 'Under Contract', count: stats.pipeline.byStage.under_contract, color: '#10B981', width: 25 },
                    { stage: 'Closed', count: stats.pipeline.byStage.closed, color: '#059669', width: 15 },
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
                      {stats.pipeline.byStage.dead.toLocaleString()} leads
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
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={pipelineProgressionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="interested"
                      stroke="#EC4899"
                      strokeWidth={2}
                      name="Interested"
                      dot={{ fill: '#EC4899', r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="offer_sent"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      name="Offer Sent"
                      dot={{ fill: '#F59E0B', r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="negotiating"
                      stroke="#EF4444"
                      strokeWidth={2}
                      name="Negotiating"
                      dot={{ fill: '#EF4444', r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="under_contract"
                      stroke="#10B981"
                      strokeWidth={2}
                      name="Under Contract"
                      dot={{ fill: '#10B981', r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="closed"
                      stroke="#059669"
                      strokeWidth={3}
                      name="Closed"
                      dot={{ fill: '#059669', r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#EC4899]" />
                    <span className="text-muted-foreground">Interested</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#F59E0B]" />
                    <span className="text-muted-foreground">Offer Sent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#EF4444]" />
                    <span className="text-muted-foreground">Negotiating</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#10B981]" />
                    <span className="text-muted-foreground">Under Contract</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#059669]" />
                    <span className="text-muted-foreground font-semibold">Closed</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

    </div>
  );
}
