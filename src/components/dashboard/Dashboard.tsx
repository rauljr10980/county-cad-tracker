import { useState, useMemo } from 'react';
import { Building2, TrendingUp, TrendingDown, AlertTriangle, Plus, Minus, Gavel, CheckCircle, Clock, Loader2, Users, DollarSign, Package, ShoppingCart, Target, TrendingUp as Pipeline, Phone } from 'lucide-react';
import { StatCard } from './StatCard';
import { StatusTransitionBadge } from '@/components/ui/StatusBadge';
import { PropertyStatus } from '@/types/property';
import { useDashboardStats, useCallStats, useCallActivity, useTeamStats } from '@/hooks/useFiles';
import { usePreForeclosures } from '@/hooks/usePreForeclosure';
import type { WorkflowStage, PreForeclosureRecord } from '@/types/property';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface DashboardProps {
  onFilterChange?: (filter: { from?: PropertyStatus; to?: PropertyStatus }) => void;
}

export function Dashboard({ onFilterChange }: DashboardProps) {
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: preForeclosureRecords, isLoading: isLoadingPreForeclosures } = usePreForeclosures();
  const { data: callStats } = useCallStats();
  const { data: callActivity } = useCallActivity();
  const { data: teamStatsRaw } = useTeamStats();

  // Use mock data if real data has no activity yet (all zeros) — remove once team starts logging calls
  const MOCK_TEAM: typeof teamStatsRaw = [
    { id: 'm1', username: 'Raul',    role: 'ADMIN',    calls: { today: 14, week: 67, month: 210 }, d4dLeads: { week: 12, month: 38, total: 95 }, followUps: { createdWeek: 5, createdMonth: 18, completedWeek: 4, completedMonth: 14 }, notes: { week: 9, month: 31 }, propertiesAssigned: 24, conversionRate: 18, pipeline: { NEW: 15, RESEARCHING: 10, CONTACTED: 6, UNDER_CONTRACT: 2, DEAD: 4 }, preForeclosure: { total: 42, researched: 31, withEquity: 22, underwater: 9 }, overdueFollowUps: 3, visitsThisWeek: 7 },
    { id: 'm2', username: 'Luciano', role: 'OPERATOR', calls: { today: 9,  week: 44, month: 130 }, d4dLeads: { week: 7,  month: 22, total: 54 }, followUps: { createdWeek: 3, createdMonth: 11, completedWeek: 2, completedMonth: 8  }, notes: { week: 5, month: 17 }, propertiesAssigned: 15, conversionRate: 13, pipeline: { NEW: 8,  RESEARCHING: 7,  CONTACTED: 3, UNDER_CONTRACT: 1, DEAD: 2 }, preForeclosure: { total: 28, researched: 18, withEquity: 11, underwater: 7 }, overdueFollowUps: 5, visitsThisWeek: 4 },
    { id: 'm3', username: 'Maria',   role: 'OPERATOR', calls: { today: 3,  week: 21, month: 74  }, d4dLeads: { week: 4,  month: 15, total: 32 }, followUps: { createdWeek: 2, createdMonth: 7,  completedWeek: 2, completedMonth: 6  }, notes: { week: 3, month: 10 }, propertiesAssigned: 9,  conversionRate: 9,  pipeline: { NEW: 5,  RESEARCHING: 4,  CONTACTED: 2, UNDER_CONTRACT: 0, DEAD: 1 }, preForeclosure: { total: 15, researched: 7,  withEquity: 5,  underwater: 2 }, overdueFollowUps: 1, visitsThisWeek: 2 },
  ];
  const allZeros = !teamStatsRaw || teamStatsRaw.every(m => m.calls.today === 0 && m.calls.week === 0 && m.d4dLeads.week === 0);
  const teamStats = allZeros ? MOCK_TEAM : teamStatsRaw;
  const isMockData = allZeros;

  const isLoading = statsLoading;
  const error = statsError;

  // Workflow stage funnel data (using pre-foreclosure workflow stages)
  const SALES_FUNNEL_STAGES: { key: WorkflowStage; label: string; color: string }[] = [
    { key: 'not_started', label: 'Not Started', color: '#6B7280' },
    { key: 'initial_visit', label: 'Visit', color: '#3B82F6' },
    { key: 'waiting_to_be_contacted', label: 'Waiting', color: '#06B6D4' },
    { key: 'people_search', label: 'Search', color: '#8B5CF6' },
    { key: 'call_owner', label: 'Call', color: '#EC4899' },
    { key: 'land_records', label: 'Records', color: '#F59E0B' },
    { key: 'visit_heirs', label: 'Visit Heirs', color: '#F97316' },
    { key: 'call_heirs', label: 'Call Heirs', color: '#EF4444' },
    { key: 'negotiating', label: 'Negotiating', color: '#10B981' },
    { key: 'comps', label: 'Comps', color: '#14B8A6' },
    { key: 'sent_offer', label: 'Sent Offer', color: '#22C55E' },
  ];

  // Calculate workflow stage counts from pre-foreclosure records
  // NOTE: All hooks must be called before any early returns
  const workflowStageCounts = useMemo(() => {
    const records = (preForeclosureRecords ?? []) as PreForeclosureRecord[];
    const counts: Record<WorkflowStage, number> = {
      not_started: 0, initial_visit: 0, waiting_to_be_contacted: 0, people_search: 0, call_owner: 0,
      land_records: 0, visit_heirs: 0, call_heirs: 0, negotiating: 0, comps: 0, sent_offer: 0, dead_end: 0,
    };
    for (const r of records) {
      const stage = (r.workflow_stage as WorkflowStage) || 'not_started';
      if (stage in counts) counts[stage]++;
    }
    return counts;
  }, [preForeclosureRecords]);

  const maxWorkflowStageCount = useMemo(() => {
    const activeStages = SALES_FUNNEL_STAGES.map(s => workflowStageCounts[s.key]);
    return Math.max(1, ...activeStages);
  }, [workflowStageCounts]);

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
    weeklyVisits: stats?.weeklyVisits || { weekStartDate: '', total: 0, byUser: [] },
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
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Call Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Phone className="h-4 w-4 text-green-400" />
            Call Activity
          </CardTitle>
          <CardDescription>Phone call button clicks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-green-400">{callStats?.daily ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Today</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{callStats?.weekly ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">This Week</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{callStats?.monthly ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">This Month</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call Activity Chart — 14-day daily breakdown */}
      {(() => {
        // Use real data or mock 14-day sample
        const MOCK_ACTIVITY = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - (13 - i));
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return { date: label, Raul: isWeekend ? 0 : Math.floor(Math.random() * 18) + 4, Luciano: isWeekend ? 0 : Math.floor(Math.random() * 12) + 2, Maria: isWeekend ? 0 : Math.floor(Math.random() * 8) + 1 };
        });
        const hasRealActivity = callActivity?.some(d => (d.total as number) > 0);
        const chartData = hasRealActivity ? callActivity! : MOCK_ACTIVITY;

        // Collect all user names present in the data
        const userNames = Array.from(new Set(
          chartData.flatMap(d => Object.keys(d).filter(k => k !== 'date' && k !== 'total'))
        ));
        const USER_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#f97316', '#ec4899'];

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4 text-green-400" />
                Call Activity — Last 14 Days
                {!hasRealActivity && isMockData && (
                  <span className="text-[10px] font-normal bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded px-1.5 py-0.5">sample data</span>
                )}
              </CardTitle>
              <CardDescription>Daily calls per team member</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                    cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  {userNames.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="calls" fill={USER_COLORS[i % USER_COLORS.length]} radius={i === userNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} maxBarSize={32} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* Team Activity */}
      {teamStats && teamStats.length > 0 && (() => {
        const sorted = [...teamStats].sort((a, b) => b.calls.today - a.calls.today);
        const BAR_H = sorted.length * 32 + 16;

        // Build chart datasets
        const callsData = sorted.map(m => ({ name: m.username, Today: m.calls.today, Week: m.calls.week, Month: m.calls.month }));
        const d4dData   = sorted.map(m => ({ name: m.username, 'D4D / wk': m.d4dLeads.week, 'D4D / mo': m.d4dLeads.month }));
        const fuData    = sorted.map(m => ({ name: m.username, Completed: m.followUps.completedWeek, Created: m.followUps.createdWeek }));
        const notesData = sorted.map(m => ({ name: m.username, 'Notes / wk': m.notes.week }));
        const overdueData = sorted.map(m => ({ name: m.username, Overdue: m.overdueFollowUps }));
        const visitsData  = sorted.map(m => ({ name: m.username, 'Visits / wk': m.visitsThisWeek }));
        const pfData    = sorted.map(m => ({
          name: m.username,
          'Has Equity': m.preForeclosure.withEquity,
          Underwater: m.preForeclosure.underwater,
          'Not Researched': m.preForeclosure.total - m.preForeclosure.researched,
        }));
        const pipeData  = sorted.map(m => ({
          name: m.username,
          New: m.pipeline['NEW'] || 0,
          Researching: m.pipeline['RESEARCHING'] || 0,
          Contacted: m.pipeline['CONTACTED'] || 0,
          'Under Ctr': m.pipeline['UNDER_CONTRACT'] || 0,
          Dead: m.pipeline['DEAD'] || 0,
        }));

        const MiniChart = ({ title, data, bars }: {
          title: string;
          data: any[];
          bars: { key: string; color: string }[];
        }) => (
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={BAR_H}>
                <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={60} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  {bars.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />}
                  {bars.map(b => (
                    <Bar key={b.key} dataKey={b.key} fill={b.color} radius={[0, 3, 3, 0]} maxBarSize={20} label={{ position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Team Activity</h2>
              {isMockData && (
                <span className="text-[10px] font-normal bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded px-1.5 py-0.5">
                  sample data
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <MiniChart title="Calls" data={callsData} bars={[
                { key: 'Today', color: '#22c55e' },
                { key: 'Week',  color: '#3b82f6' },
                { key: 'Month', color: '#6366f1' },
              ]} />
              <MiniChart title="D4D Leads Added" data={d4dData} bars={[
                { key: 'D4D / wk', color: '#f59e0b' },
                { key: 'D4D / mo', color: '#f97316' },
              ]} />
              <MiniChart title="Follow-ups (this week)" data={fuData} bars={[
                { key: 'Completed', color: '#22c55e' },
                { key: 'Created',   color: '#6b7280' },
              ]} />
              <MiniChart title="Notes Written (this week)" data={notesData} bars={[
                { key: 'Notes / wk', color: '#8b5cf6' },
              ]} />
              <MiniChart title="Pre-Foreclosure Research" data={pfData} bars={[
                { key: 'Has Equity',     color: '#22c55e' },
                { key: 'Underwater',     color: '#ef4444' },
                { key: 'Not Researched', color: '#374151' },
              ]} />
              <MiniChart title="Overdue Follow-ups" data={overdueData} bars={[
                { key: 'Overdue', color: '#ef4444' },
              ]} />
              <MiniChart title="Property Visits (this week)" data={visitsData} bars={[
                { key: 'Visits / wk', color: '#06b6d4' },
              ]} />
              <MiniChart title="D4D Pipeline" data={pipeData} bars={[
                { key: 'New',        color: '#6b7280' },
                { key: 'Researching',color: '#3b82f6' },
                { key: 'Contacted',  color: '#eab308' },
                { key: 'Under Ctr',  color: '#22c55e' },
                { key: 'Dead',       color: '#7f1d1d' },
              ]} />
            </div>
          </div>
        );
      })()}

      {/* ---- everything below is removed — dashboard is team-only ---- */}
      {false && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

      {/* Property Status Distribution */}
      <div className="grid grid-cols-1 gap-4 md:gap-6">
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
      </div>

      {/* Weekly Visits Tracker */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Weekly Visits</CardTitle>
                <p className="text-sm text-muted-foreground">Properties visited this week</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Resets Sunday</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Grand Total */}
              <div className="flex items-center justify-between text-sm pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏠</span>
                  <span className="font-medium">Total Visits</span>
                </div>
                <span className="text-2xl font-bold text-primary">
                  {safeStats.weeklyVisits.total}
                </span>
              </div>

              {/* Per-user breakdown - always show all known users */}
              {(() => {
                const knownUsers = ['Luciano', 'Raul'];
                const byUser = safeStats.weeklyVisits.byUser;
                const merged = knownUsers.map(name => {
                  const found = byUser.find(u => u.user === name);
                  return found || { user: name, properties: 0, preForeclosures: 0, total: 0 };
                });
                // Also include any users from backend not in knownUsers
                byUser.forEach(u => {
                  if (!knownUsers.includes(u.user)) merged.push(u);
                });
                return merged;
              })().map((userVisit, index) => {
                const maxTotal = Math.max(safeStats.weeklyVisits.total, 1);
                const colors = ['#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
                const color = colors[index % colors.length];
                return (
                  <div key={userVisit.user} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">👤</span>
                        <span className="text-muted-foreground">{userVisit.user}</span>
                      </div>
                      <span className="font-bold" style={{ color }}>
                        {userVisit.total}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 pl-8 text-xs text-muted-foreground">
                      <span>{userVisit.properties} Tax Delinquent</span>
                      <span>{userVisit.preForeclosures} Pre-Foreclosures</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          backgroundColor: color,
                          width: `${Math.min((userVisit.total / maxTotal) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </div>
                );
              })}
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

      </div>}

    </div>
  );
}
