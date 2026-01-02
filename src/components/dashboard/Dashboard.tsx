import { Building2, TrendingUp, TrendingDown, AlertTriangle, Plus, Minus, Gavel, CheckCircle, Clock, Loader2, Users, DollarSign, Package, ShoppingCart } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyStatus } from '@/types/property';
import { useDashboardStats } from '@/hooks/useFiles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
}

export function Dashboard({ onFilterChange }: DashboardProps) {
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();

  const isLoading = statsLoading;
  const error = statsError;

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

      {/* Bottom Row - Status Distribution and Amount Ranges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Property Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Property Status Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Breakdown by delinquency status</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
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
              <div className="flex-1 space-y-3">
                {statusData.map((item, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.percentage}%</span>
                    </div>
                    <div className="text-xs text-muted-foreground ml-5">
                      {item.value.toLocaleString()} properties
                    </div>
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
      </div>

    </div>
  );
}
