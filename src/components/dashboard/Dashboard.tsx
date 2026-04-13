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
    { id: 'm4', username: 'Carlos',  role: 'OPERATOR', calls: { today: 11, week: 53, month: 165 }, d4dLeads: { week: 9,  month: 28, total: 70 }, followUps: { createdWeek: 4, createdMonth: 13, completedWeek: 3, completedMonth: 10 }, notes: { week: 6, month: 22 }, propertiesAssigned: 18, conversionRate: 15, pipeline: { NEW: 11, RESEARCHING: 8,  CONTACTED: 5, UNDER_CONTRACT: 1, DEAD: 3 }, preForeclosure: { total: 33, researched: 22, withEquity: 16, underwater: 6 }, overdueFollowUps: 2, visitsThisWeek: 5 },
    { id: 'm5', username: 'Sofia',   role: 'OPERATOR', calls: { today: 7,  week: 35, month: 98  }, d4dLeads: { week: 5,  month: 18, total: 41 }, followUps: { createdWeek: 3, createdMonth: 9,  completedWeek: 2, completedMonth: 7  }, notes: { week: 4, month: 14 }, propertiesAssigned: 12, conversionRate: 11, pipeline: { NEW: 7,  RESEARCHING: 5,  CONTACTED: 3, UNDER_CONTRACT: 1, DEAD: 2 }, preForeclosure: { total: 20, researched: 13, withEquity: 9,  underwater: 4 }, overdueFollowUps: 4, visitsThisWeek: 3 },
    { id: 'm6', username: 'Diego',   role: 'OPERATOR', calls: { today: 5,  week: 28, month: 82  }, d4dLeads: { week: 3,  month: 12, total: 27 }, followUps: { createdWeek: 2, createdMonth: 6,  completedWeek: 1, completedMonth: 5  }, notes: { week: 2, month: 8  }, propertiesAssigned: 8,  conversionRate: 7,  pipeline: { NEW: 4,  RESEARCHING: 3,  CONTACTED: 1, UNDER_CONTRACT: 0, DEAD: 1 }, preForeclosure: { total: 12, researched: 5,  withEquity: 3,  underwater: 2 }, overdueFollowUps: 2, visitsThisWeek: 1 },
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

      {/* ── Call Activity — 14-day stacked bar chart ── */}
      {(() => {
        const MOCK_ACTIVITY = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - (13 - i));
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return { date: label, Raul: isWeekend ? 0 : Math.floor(Math.random() * 18) + 4, Luciano: isWeekend ? 0 : Math.floor(Math.random() * 12) + 2, Maria: isWeekend ? 0 : Math.floor(Math.random() * 8) + 1 };
        });
        const hasRealActivity = callActivity?.some(d => (d.total as number) > 0);
        const chartData = hasRealActivity ? callActivity! : MOCK_ACTIVITY;
        const userNames = Array.from(new Set(chartData.flatMap(d => Object.keys(d).filter(k => k !== 'date' && k !== 'total'))));
        const USER_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f97316', '#ec4899'];

        return (
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Phone className="h-4 w-4 text-emerald-400" />
                    Call Activity
                    {!hasRealActivity && isMockData && (
                      <span className="text-[10px] font-normal bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded px-1.5 py-0.5">sample</span>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Daily calls per team member — last 14 days</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {userNames.map((n, i) => (
                    <div key={n} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: USER_COLORS[i % USER_COLORS.length] }} />
                      <span className="text-muted-foreground">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ left: 4, right: 4, top: 4, bottom: 0 }} barCategoryGap="30%">
                  <defs>
                    {userNames.map((n, i) => (
                      <linearGradient key={n} id={`grad-activity-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={USER_COLORS[i % USER_COLORS.length]} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={USER_COLORS[i % USER_COLORS.length]} stopOpacity={0.65} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 }}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3, radius: 4 }}
                  />
                  {userNames.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="calls" fill={`url(#grad-activity-${i})`}
                      radius={i === userNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={40} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Team Activity Charts ── */}
      {teamStats && teamStats.length > 0 && (() => {
        const sorted = [...teamStats].sort((a, b) => b.calls.today - a.calls.today);

        const callsData   = sorted.map(m => ({ name: m.username, Today: m.calls.today, Week: m.calls.week, Month: m.calls.month }));
        const d4dData     = sorted.map(m => ({ name: m.username, 'This Week': m.d4dLeads.week, 'This Month': m.d4dLeads.month }));
        const fuData      = sorted.map(m => ({ name: m.username, Completed: m.followUps.completedWeek, Created: m.followUps.createdWeek }));
        const notesData   = sorted.map(m => ({ name: m.username, Notes: m.notes.week }));
        const overdueData = sorted.map(m => ({ name: m.username, Overdue: m.overdueFollowUps }));
        const visitsData  = sorted.map(m => ({ name: m.username, Visits: m.visitsThisWeek }));
        const pfData      = sorted.map(m => ({
          name: m.username,
          'Has Equity': m.preForeclosure.withEquity,
          Underwater: m.preForeclosure.underwater,
          Pending: m.preForeclosure.total - m.preForeclosure.researched,
        }));
        const pipeData = sorted.map(m => ({
          name: m.username,
          New: m.pipeline['NEW'] || 0,
          Researching: m.pipeline['RESEARCHING'] || 0,
          Contacted: m.pipeline['CONTACTED'] || 0,
          'Under Contract': m.pipeline['UNDER_CONTRACT'] || 0,
          Dead: m.pipeline['DEAD'] || 0,
        }));

        const TOOLTIP_STYLE = {
          contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' },
          labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 },
          cursor: { fill: 'hsl(var(--muted))', opacity: 0.25 },
        };

        type ChartConfig = {
          title: string;
          subtitle: string;
          data: any[];
          bars: { key: string; color: string; gradId: string }[];
          accent: string;
        };

        const charts: ChartConfig[] = [
          {
            title: 'Calls Made', subtitle: 'Today · Week · Month',
            data: callsData, accent: '#10b981',
            bars: [
              { key: 'Today', color: '#10b981', gradId: 'g-calls-today' },
              { key: 'Week',  color: '#3b82f6', gradId: 'g-calls-week' },
              { key: 'Month', color: '#6366f1', gradId: 'g-calls-month' },
            ],
          },
          {
            title: 'D4D Leads Added', subtitle: 'This week vs this month',
            data: d4dData, accent: '#f59e0b',
            bars: [
              { key: 'This Week',  color: '#f59e0b', gradId: 'g-d4d-wk' },
              { key: 'This Month', color: '#f97316', gradId: 'g-d4d-mo' },
            ],
          },
          {
            title: 'Follow-ups', subtitle: 'Completed vs created this week',
            data: fuData, accent: '#10b981',
            bars: [
              { key: 'Completed', color: '#10b981', gradId: 'g-fu-done' },
              { key: 'Created',   color: '#475569', gradId: 'g-fu-all'  },
            ],
          },
          {
            title: 'Notes Written', subtitle: 'This week',
            data: notesData, accent: '#8b5cf6',
            bars: [{ key: 'Notes', color: '#8b5cf6', gradId: 'g-notes' }],
          },
          {
            title: 'Pre-Foreclosure Research', subtitle: 'Equity status of assigned records',
            data: pfData, accent: '#10b981',
            bars: [
              { key: 'Has Equity', color: '#10b981', gradId: 'g-pf-eq'  },
              { key: 'Underwater', color: '#ef4444', gradId: 'g-pf-uw'  },
              { key: 'Pending',    color: '#374151', gradId: 'g-pf-pend' },
            ],
          },
          {
            title: 'Overdue Follow-ups', subtitle: 'Unresolved past-due tasks',
            data: overdueData, accent: '#ef4444',
            bars: [{ key: 'Overdue', color: '#ef4444', gradId: 'g-overdue' }],
          },
          {
            title: 'Property Visits', subtitle: 'Drive-bys logged this week',
            data: visitsData, accent: '#06b6d4',
            bars: [{ key: 'Visits', color: '#06b6d4', gradId: 'g-visits' }],
          },
          {
            title: 'D4D Pipeline', subtitle: 'Lead stages across team',
            data: pipeData, accent: '#3b82f6',
            bars: [
              { key: 'New',           color: '#64748b', gradId: 'g-pipe-new'  },
              { key: 'Researching',   color: '#3b82f6', gradId: 'g-pipe-res'  },
              { key: 'Contacted',     color: '#eab308', gradId: 'g-pipe-con'  },
              { key: 'Under Contract',color: '#10b981', gradId: 'g-pipe-uc'   },
              { key: 'Dead',          color: '#7f1d1d', gradId: 'g-pipe-dead' },
            ],
          },
        ];

        const CHART_H = 180;

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Team Activity</h2>
                {isMockData && (
                  <span className="text-[10px] font-normal bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded px-1.5 py-0.5">sample data</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {charts.map(({ title, subtitle, data, bars, accent }) => (
                <Card key={title} className="border-border/60 overflow-hidden">
                  {/* Accent top bar */}
                  <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accent}99, transparent)` }} />
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
                    <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                    {bars.length > 1 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                        {bars.map(b => (
                          <div key={b.key} className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-sm" style={{ background: b.color }} />
                            <span className="text-[10px] text-muted-foreground">{b.key}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="px-2 pb-3">
                    <ResponsiveContainer width="100%" height={CHART_H}>
                      <BarChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }} barCategoryGap="28%">
                        <defs>
                          {bars.map(b => (
                            <linearGradient key={b.gradId} id={b.gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={b.color} stopOpacity={0.95} />
                              <stop offset="100%" stopColor={b.color} stopOpacity={0.65} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.5} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false}
                          tick={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 500, fontFamily: 'inherit' }} />
                        <YAxis axisLine={false} tickLine={false} allowDecimals={false} width={24}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        {bars.map((b) => (
                          <Bar key={b.key} dataKey={b.key} fill={`url(#${b.gradId})`}
                            radius={[4, 4, 0, 0]} maxBarSize={32}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
