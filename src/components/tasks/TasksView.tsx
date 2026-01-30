import { useState, useMemo } from 'react';
import { Phone, MessageSquare, Mail, Car, CheckSquare, Loader2, AlertCircle, Eye, Clock, Flag, Filter, CheckCircle2, X, Trash2 } from 'lucide-react';
import { Property, PreForeclosure } from '@/types/property';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTasks, updatePropertyAction, markTaskDone, deleteTask, updatePropertyPriority, updatePreForeclosure, getPreForeclosures, getProperties } from '@/lib/api';
import { format, isToday, isPast, parseISO, startOfDay, isBefore, isAfter } from 'date-fns';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { PreForeclosureDetailsModal } from '@/components/preforeclosures/PreForeclosureDetailsModal';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import { usePreForeclosures } from '@/hooks/usePreForeclosure';
import type { WorkflowStage } from '@/types/property';

type ActionType = 'call' | 'text' | 'mail' | 'driveby';
type Priority = 'high' | 'med' | 'low';
type Outcome = 'no_answer' | 'voicemail' | 'text_sent' | 'spoke_owner' | 'wrong_number' | 'not_interested' | 'new_owner' | 'call_back_later';
type FilterMode = 'all' | 'call' | 'text' | 'mail' | 'driveby' | 'hot_today' | 'overdue';

const ACTION_ICONS = {
  call: Phone,
  text: MessageSquare,
  mail: Mail,
  driveby: Car,
};

const ACTION_LABELS = {
  call: '📞 Call',
  text: '💬 Text',
  mail: '✉️ Mail',
  driveby: '🚗 Drive-by',
};

const PRIORITY_COLORS = {
  high: 'bg-red-500/20 text-red-500 border-red-500/30',
  med: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-500 border-green-500/30',
};

const OUTCOME_OPTIONS: { value: Outcome; label: string; nextAction?: ActionType }[] = [
  { value: 'no_answer', label: 'No answer', nextAction: 'call' },
  { value: 'voicemail', label: 'Left voicemail', nextAction: 'call' },
  { value: 'text_sent', label: 'Text sent', nextAction: 'text' },
  { value: 'spoke_owner', label: 'Spoke to owner', nextAction: 'call' },
  { value: 'wrong_number', label: 'Wrong number', nextAction: 'call' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'new_owner', label: 'New owner', nextAction: 'call' },
  { value: 'call_back_later', label: 'Call back later', nextAction: 'call' },
];

export function TasksView() {
  const queryClient = useQueryClient();
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedPreForeclosure, setSelectedPreForeclosure] = useState<PreForeclosure | null>(null);
  const [selectedForOutcome, setSelectedForOutcome] = useState<Property | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | ''>('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedPerson, setSelectedPerson] = useState<'luciano' | 'raul' | null>(null);
  const [sortBy, setSortBy] = useState<'urgency' | 'action' | 'overdue'>('urgency');
  const [updatingPriority, setUpdatingPriority] = useState<Set<string>>(new Set());
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState<{ [key: string]: boolean }>({});

  const handleDeleteTask = async (property: Property) => {
    try {
      if (isPreForeclosureTask(property)) {
        const docNumber = (property as any).documentNumber || property.accountNumber;
        await updatePreForeclosure({
          document_number: docNumber,
          actionType: null as any,
          dueTime: null as any,
          priority: null as any,
          assignedTo: null as any,
        });
      } else if (property.taskId) {
        await deleteTask(property.taskId);
      } else {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Task Deleted',
        description: 'Task has been removed.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete task',
        variant: 'destructive',
      });
    }
  };

  // Helper to check if a task is from a pre-foreclosure (has documentNumber)
  const isPreForeclosureTask = (task: Property): boolean => {
    return !!(task as any).documentNumber;
  };

  const { data, isLoading, error, refetch } = useQuery<Property[]>({
    queryKey: ['tasks'],
    queryFn: getTasks,
    refetchOnMount: true,
    refetchInterval: 30000,
  });

  // Fetch all properties for deal funnel
  const { data: allPropertiesData, isLoading: isLoadingProperties, error: propertiesError } = useQuery<{ properties: Property[] } | Property[]>({
    queryKey: ['properties', 'all'],
    queryFn: async () => {
      console.log('[TasksView] Fetching properties for Sales Funnel...');
      try {
        const result = await getProperties(1, 50000);
        console.log('[TasksView] Properties fetched:', {
          isArray: Array.isArray(result),
          hasProperties: !!(result as any)?.properties,
          count: Array.isArray(result) ? result.length : (result as any)?.properties?.length || 0
        });
        return result;
      } catch (error) {
        console.error('[TasksView] Error fetching properties:', error);
        throw error;
      }
    },
    refetchOnMount: true,
    refetchInterval: 60000, // Refresh every minute
    retry: 1,
  });

  // Debug logging
  console.log('[TasksView] Sales Funnel State:', {
    isLoadingProperties,
    hasError: !!propertiesError,
    error: propertiesError,
    hasData: !!allPropertiesData,
    dataType: allPropertiesData ? (Array.isArray(allPropertiesData) ? 'array' : 'object') : 'null'
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Parse property address to extract owner name and address
  const parsePropertyAddress = (address: string) => {
    if (!address) return { ownerName: '', address: '' };
    
    const numberMatches = Array.from(address.matchAll(/\b(\d+)\b/g));
    
    if (numberMatches.length === 0) {
      return { ownerName: '', address: address.trim() };
    }
    
    for (const match of numberMatches) {
      const number = match[0];
      const index = match.index!;
      const beforeMatch = address.substring(0, index).trim();
      const afterMatch = address.substring(index + number.length).trim();
      
      if (index === 0) continue;
      
      if (number.length === 5 && /^\d{5}$/.test(number)) {
        const remainingAfter = address.substring(index + number.length).trim();
        if (remainingAfter.length < 5) continue;
      }
      
      if (beforeMatch.length > 0 && afterMatch.length > 0) {
        if (address[index - 1] === ' ') {
          const ownerName = beforeMatch.trim();
          const addressPart = address.substring(index).trim();
          return { ownerName, address: addressPart };
        }
      }
    }
    
    const firstNumberWithSpace = address.match(/\s+(\d+)\s+/);
    if (firstNumberWithSpace) {
      const matchIndex = address.indexOf(firstNumberWithSpace[0]);
      const ownerName = address.substring(0, matchIndex).trim();
      const addressPart = address.substring(matchIndex + 1).trim();
      return { ownerName, address: addressPart };
    }
    
    return { ownerName: '', address: address.trim() };
  };

  // Get task status
  const getTaskStatus = (property: Property) => {
    if (!property.dueTime) return { type: 'scheduled', icon: '⚫', label: 'Scheduled' };
    
    const dueDate = parseISO(property.dueTime);
    const now = new Date();
    
    if (isBefore(dueDate, now)) {
      return { type: 'overdue', icon: '🔴', label: 'Overdue' };
    } else if (isToday(dueDate)) {
      return { type: 'today', icon: '🟡', label: 'Due today' };
    } else {
      return { type: 'scheduled', icon: '🟢', label: 'Scheduled' };
    }
  };

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    const tasksData = data || [];
    if (tasksData.length === 0) return [];

    let filtered = [...tasksData];

    // Apply person filter
    if (selectedPerson) {
      filtered = filtered.filter(p => p.assignedTo && p.assignedTo.toLowerCase() === selectedPerson);
    }

    // Apply filters
    if (filterMode === 'call' || filterMode === 'text' || filterMode === 'mail' || filterMode === 'driveby') {
      filtered = filtered.filter(p => p.actionType === filterMode);
    } else if (filterMode === 'hot_today') {
      filtered = filtered.filter(p => {
        if (!p.dueTime) return false;
        return isToday(parseISO(p.dueTime));
      });
    } else if (filterMode === 'overdue') {
      filtered = filtered.filter(p => {
        if (!p.dueTime) return false;
        return isBefore(parseISO(p.dueTime), new Date());
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'urgency') {
        // Priority first (high > med > low)
        const priorityOrder = { high: 3, med: 2, low: 1 };
        const aPriority = priorityOrder[a.priority || 'low'];
        const bPriority = priorityOrder[b.priority || 'low'];
        if (aPriority !== bPriority) return bPriority - aPriority;

        // Then overdue status
        const aOverdue = a.dueTime && isBefore(parseISO(a.dueTime), new Date());
        const bOverdue = b.dueTime && isBefore(parseISO(b.dueTime), new Date());
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      } else if (sortBy === 'action') {
        // Action type order: call > text > mail > driveby
        const actionOrder = { call: 4, text: 3, mail: 2, driveby: 1 };
        const aAction = actionOrder[a.actionType || 'call'];
        const bAction = actionOrder[b.actionType || 'call'];
        if (aAction !== bAction) return bAction - aAction;
      } else if (sortBy === 'overdue') {
        // Overdue first
        const aOverdue = a.dueTime && isBefore(parseISO(a.dueTime), new Date());
        const bOverdue = b.dueTime && isBefore(parseISO(b.dueTime), new Date());
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      }

      // Then by due time
      if (a.dueTime && b.dueTime) {
        return parseISO(a.dueTime).getTime() - parseISO(b.dueTime).getTime();
      }
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return 0;
    });

    return filtered;
  }, [data, filterMode, sortBy, selectedPerson]);

  // Task summary stats - Total tasks and assigned to users
  const taskStats = useMemo(() => {
    const tasksData = data || [];
    
    return {
      total: tasksData.length,
      luciano: tasksData.filter(p => 
        p.assignedTo && p.assignedTo.toLowerCase() === 'luciano'
      ).length,
      raul: tasksData.filter(p => 
        p.assignedTo && p.assignedTo.toLowerCase() === 'raul'
      ).length,
    };
  }, [data]);

  // End-of-day stats (performance tracking)
  const todayStats = useMemo(() => {
    const tasksData = data || [];
    const today = new Date();
    const todayStart = startOfDay(today);

    return {
      completed: tasksData.filter(p => {
        if (!p.lastOutcomeDate) return false;
        const outcomeDate = parseISO(p.lastOutcomeDate);
        return isToday(outcomeDate);
      }).length,
      contacts: tasksData.filter(p => {
        const outcome = p.lastOutcome;
        return outcome && ['spoke_owner', 'voicemail', 'text_sent'].includes(outcome);
      }).length,
      warm: tasksData.filter(p => p.lastOutcome === 'spoke_owner').length,
      followUps: tasksData.filter(p => p.dueTime && isAfter(parseISO(p.dueTime), todayStart)).length,
    };
  }, [data]);

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

  // Use pre-foreclosure workflow stages for Sales Funnel
  const workflowStageCounts = useMemo(() => {
    const records = preForeclosureRecords || [];
    
    console.log('[TasksView] Calculating workflow stage counts from', records.length, 'pre-foreclosure records');
    
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

    for (const r of records) {
      const stage = (r.workflow_stage as WorkflowStage) || 'not_started';
      if (stage in counts) {
        counts[stage]++;
      }
    }

    console.log('[TasksView] Workflow stage counts:', counts);
    return counts;
  }, [preForeclosureRecords]);

  const maxWorkflowStageCount = useMemo(() => {
    const activeStages = SALES_FUNNEL_STAGES.map(s => workflowStageCounts[s.key]);
    return Math.max(1, ...activeStages);
  }, [workflowStageCounts]);

  // Workflow stage funnel data (pre-foreclosure) - used for Sales Funnel
  const { data: preForeclosureRecords, isLoading: isLoadingPreForeclosures, error: preForeclosureError } = usePreForeclosures();

  const FUNNEL_STAGES: { key: WorkflowStage; label: string; color: string }[] = [
    { key: 'not_started', label: 'Not Started', color: '#6B7280' },
    { key: 'initial_visit', label: 'Initial Visit', color: '#3B82F6' },
    { key: 'people_search', label: 'People Search', color: '#8B5CF6' },
    { key: 'call_owner', label: 'Call Owner', color: '#EC4899' },
    { key: 'land_records', label: 'Land Records', color: '#F59E0B' },
    { key: 'visit_heirs', label: 'Visit Heirs', color: '#F97316' },
    { key: 'call_heirs', label: 'Call Heirs', color: '#EF4444' },
    { key: 'negotiating', label: 'Negotiating', color: '#10B981' },
    { key: 'dead_end', label: 'Dead End', color: '#6B7280' },
  ];

  const stageCounts = useMemo(() => {
    const records = preForeclosureRecords || [];
    const counts: Record<WorkflowStage, number> = {
      not_started: 0, initial_visit: 0, people_search: 0, call_owner: 0,
      land_records: 0, visit_heirs: 0, call_heirs: 0, negotiating: 0, dead_end: 0,
    };
    for (const r of records) {
      const stage = (r.workflow_stage as WorkflowStage) || 'not_started';
      if (stage in counts) counts[stage]++;
    }
    return counts;
  }, [preForeclosureRecords]);

  const maxStageCount = useMemo(() => {
    return Math.max(1, ...Object.values(stageCounts));
  }, [stageCounts]);

  const handleMarkDone = async (property: Property) => {
    if (!selectedOutcome) {
      toast({
        title: "Select Outcome",
        description: "Please select an outcome before marking as done",
        variant: "destructive",
      });
      return;
    }

    try {
      const outcome = OUTCOME_OPTIONS.find(o => o.value === selectedOutcome);
      await markTaskDone(property.id, selectedOutcome as Outcome, outcome?.nextAction);
      
      toast({
        title: "Task Completed",
        description: `Marked as: ${outcome?.label}`,
      });
      
      setSelectedForOutcome(null);
      setSelectedOutcome('');
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark task as done",
        variant: "destructive",
      });
    }
  };

  const handleBulkToggle = (propertyId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(propertyId)) {
      newSelected.delete(propertyId);
    } else {
      newSelected.add(propertyId);
    }
    setSelectedIds(newSelected);
  };

  const handlePriorityChange = async (property: Property, newPriority: Priority) => {
    if (property.priority === newPriority) {
      setPriorityPopoverOpen(prev => ({ ...prev, [property.id]: false }));
      return;
    }

    setUpdatingPriority(prev => new Set(prev).add(property.id));
    setPriorityPopoverOpen(prev => ({ ...prev, [property.id]: false }));

    try {
      await updatePropertyPriority(property.id, newPriority);
      
      // Update local cache immediately for instant feedback
      queryClient.setQueryData<Property[]>(['tasks'], (oldData) => {
        if (!oldData) return oldData;
        return oldData.map(p => 
          p.id === property.id 
            ? { ...p, priority: newPriority }
            : p
        );
      });

      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      toast({
        title: "Priority Updated",
        description: `Changed to ${newPriority.toUpperCase()}`,
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update priority",
        variant: "destructive",
      });
    } finally {
      setUpdatingPriority(prev => {
        const newSet = new Set(prev);
        newSet.delete(property.id);
        return newSet;
      });
    }
  };

  // Handle pre-foreclosure updates
  const handlePreForeclosureUpdate = async (documentNumber: string, updates: Partial<PreForeclosure>) => {
    try {
      await updatePreForeclosure({
        document_number: documentNumber,
        ...updates,
      });
      
      // Refetch tasks to get updated data
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      
      toast({
        title: "Record Updated",
        description: "Pre-foreclosure record updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update pre-foreclosure record",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive">Failed to load tasks</p>
        </div>
      </div>
    );
  }

  const tasks = data || [];

  return (
    <div className="p-6">
      {/* Person Selector Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <button
          onClick={() => setSelectedPerson(selectedPerson === 'luciano' ? null : 'luciano')}
          className={cn(
            "rounded-xl border-2 p-6 text-center transition-all cursor-pointer",
            selectedPerson === 'luciano'
              ? "border-green-500 bg-green-500/10"
              : selectedPerson === null
                ? "border-border bg-card hover:border-green-500/50"
                : "border-border bg-card/50 opacity-50 hover:opacity-75"
          )}
        >
          <p className="text-4xl font-bold text-green-500">{taskStats.luciano}</p>
          <p className="text-lg font-semibold mt-2">Luciano</p>
          <p className="text-xs text-muted-foreground mt-1">tasks</p>
        </button>
        <button
          onClick={() => setSelectedPerson(selectedPerson === 'raul' ? null : 'raul')}
          className={cn(
            "rounded-xl border-2 p-6 text-center transition-all cursor-pointer",
            selectedPerson === 'raul'
              ? "border-orange-500 bg-orange-500/10"
              : selectedPerson === null
                ? "border-border bg-card hover:border-orange-500/50"
                : "border-border bg-card/50 opacity-50 hover:opacity-75"
          )}
        >
          <p className="text-4xl font-bold text-orange-500">{taskStats.raul}</p>
          <p className="text-lg font-semibold mt-2">Raul</p>
          <p className="text-xs text-muted-foreground mt-1">tasks</p>
        </button>
      </div>

      {/* Sales Funnel - Deal Workflow - ALWAYS VISIBLE */}
      <div className="mb-6 rounded-xl border-4 border-blue-500 bg-card p-6 shadow-2xl" style={{ minHeight: '300px', backgroundColor: 'hsl(var(--card))' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-3xl font-bold tracking-tight text-foreground">Sales Funnel</h3>
            <p className="text-sm text-muted-foreground mt-1">Current pipeline snapshot</p>
          </div>
        </div>
        {isLoadingPreForeclosures ? (
          <div className="mt-5 flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <span className="ml-3 text-base text-foreground">Loading pipeline data...</span>
          </div>
        ) : preForeclosureError ? (
          <div className="mt-5 flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <span className="text-base text-destructive font-semibold">Failed to load pipeline data</span>
            <span className="text-xs text-muted-foreground mt-1">Error: {String(preForeclosureError)}</span>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {SALES_FUNNEL_STAGES.map((stage) => {
              const count = workflowStageCounts[stage.key] || 0;
              const width = maxWorkflowStageCount > 0 ? Math.max(count > 0 ? 5 : 0, (count / maxWorkflowStageCount) * 100) : 0;
              const showNumberInside = width > 20;
              return (
                <div key={stage.key} className="min-h-[4rem]">
                  <div className="flex items-center justify-between text-base mb-2">
                    <span className="font-semibold text-foreground text-lg">{stage.label}</span>
                    <span className="text-muted-foreground font-bold text-base">{count} {count === 1 ? 'deal' : 'deals'}</span>
                  </div>
                  <div className="relative w-full h-10 bg-secondary/70 rounded-lg overflow-hidden border-2 border-border">
                    {count > 0 ? (
                      <div
                        className="h-full flex items-center justify-center text-white font-bold text-base rounded-lg transition-all duration-300"
                        style={{ backgroundColor: stage.color, width: `${width}%`, minWidth: count > 0 ? '5%' : '0%' }}
                      >
                        {showNumberInside ? count : ''}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center bg-secondary/30">
                        <span className="text-sm text-muted-foreground">0</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Dead End - separated */}
            {workflowStageCounts.dead_end > 0 && (
              <div className="mt-6 pt-6 border-t-2 border-border">
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground flex items-center gap-2 font-semibold">
                    <span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />
                    Dead End
                  </span>
                  <span className="text-muted-foreground font-bold">{workflowStageCounts.dead_end} deals</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* No Tasks Message */}
      {tasks.length === 0 && (
        <div className="mb-6 bg-secondary/30 rounded-lg p-12 text-center">
          <CheckSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Tasks</h3>
          <p className="text-muted-foreground">
            Set action types and due times on properties to see them here.
          </p>
        </div>
      )}

      {/* Deal Workflow Pipeline Funnel (Pre-Foreclosure) */}
      {preForeclosureRecords && preForeclosureRecords.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <h3 className="text-xl font-bold tracking-tight">Deal Pipeline</h3>
          <p className="text-sm text-muted-foreground mt-1">Current stage distribution</p>
          <div className="mt-5 space-y-3">
            {FUNNEL_STAGES.filter(s => s.key !== 'dead_end').map((stage) => {
              const count = stageCounts[stage.key];
              const width = Math.max(count > 0 ? 5 : 0, (count / maxStageCount) * 100);
              return (
                <div key={stage.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground">{count} {count === 1 ? 'deal' : 'deals'}</span>
                  </div>
                  <div className="relative w-full h-8 bg-secondary/50 rounded-lg overflow-hidden">
                    {count > 0 && (
                      <div
                        className="h-full flex items-center justify-center text-white font-semibold text-sm rounded-lg transition-all duration-300"
                        style={{ backgroundColor: stage.color, width: `${width}%` }}
                      >
                        {width > 15 ? count : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Dead End - separated */}
          {stageCounts.dead_end > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
                  Dead End
                </span>
                <span className="text-muted-foreground">{stageCounts.dead_end} deals</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header Controls */}
      <div className="mb-8 flex items-center justify-between flex-wrap gap-6 pb-4 border-b border-border">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Action Queue</h2>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            {filteredAndSortedTasks.length} task{filteredAndSortedTasks.length !== 1 ? 's' : ''} ready for action
          </p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger className="w-[160px] h-10 font-medium">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="call">📞 Calls</SelectItem>
              <SelectItem value="text">💬 Texts</SelectItem>
              <SelectItem value="mail">✉️ Mail</SelectItem>
              <SelectItem value="driveby">🚗 Drive-bys</SelectItem>
              <SelectItem value="hot_today">Hot Today</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[160px] h-10 font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgency">By Urgency</SelectItem>
              <SelectItem value="action">By Action</SelectItem>
              <SelectItem value="overdue">Overdue First</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={bulkMode ? "default" : "outline"}
            size="default"
            className="h-10 font-semibold px-4"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedIds(new Set());
            }}
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            Batch Mode
          </Button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {filteredAndSortedTasks.map((property) => {
          const { ownerName, address } = parsePropertyAddress(property.propertyAddress);
          const status = getTaskStatus(property);
          const ActionIcon = property.actionType ? ACTION_ICONS[property.actionType] : Phone;
          const actionLabel = property.actionType ? ACTION_LABELS[property.actionType] : 'Call';
          const priority = property.priority || 'low';
          const dueTime = property.dueTime ? parseISO(property.dueTime) : null;
          const city = address.split(',').length > 1 ? address.split(',')[1].trim().split(' ')[0] : '';

          return (
            <div
              key={property.id}
              className={cn(
                "bg-card border border-border rounded-lg p-3 md:p-5 hover:border-primary/50 hover:shadow-md transition-all shadow-sm",
                bulkMode && "cursor-pointer",
                selectedIds.has(property.id) && "border-primary bg-primary/5 shadow-md"
              )}
              onClick={() => bulkMode && handleBulkToggle(property.id)}
            >
              {/* Mobile Layout */}
              <div className="md:hidden space-y-3">
                {/* Top Row: Action + Amount */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {bulkMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(property.id)}
                        onChange={() => handleBulkToggle(property.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-5 w-5 rounded border-2 border-border cursor-pointer accent-primary"
                      />
                    )}
                    <span className="text-lg font-bold uppercase tracking-wide text-foreground">
                      {actionLabel.replace(/[📞💬✉️🚗]/g, '').trim()}
                    </span>
                  </div>

                  <div className="flex-shrink-0">
                    {property.totalAmountDue > 0 ? (
                      <span className="text-lg font-bold font-mono tracking-tight text-green-500">
                        {formatCurrency(property.totalAmountDue)}
                      </span>
                    ) : isPreForeclosureTask(property) && (property as any).type ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-semibold px-2 py-1 rounded-md border-2",
                          (property as any).type === 'Mortgage'
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                            : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                        )}
                      >
                        {(property as any).type}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* Second Row: Priority + Assigned */}
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold px-2 py-1 rounded-md border-2",
                      PRIORITY_COLORS[priority]
                    )}
                  >
                    {priority.toUpperCase()}
                  </Badge>
                  {property.assignedTo && (
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {property.assignedTo}
                    </span>
                  )}
                </div>

                {/* Notes */}
                {property.notes && property.notes.trim() && (
                  <div className="text-sm text-muted-foreground break-words whitespace-pre-wrap">
                    {property.notes}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="default"
                    className="flex-1 border-border hover:border-primary hover:bg-primary/10 min-h-[44px]"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (isPreForeclosureTask(property)) {
                        const docNumber = (property as any).documentNumber || property.accountNumber;
                        try {
                          const allRecords = await getPreForeclosures();
                          const fullRecord = allRecords.find(r => r.document_number === docNumber);
                          if (fullRecord) {
                            setSelectedPreForeclosure(fullRecord);
                          } else {
                            toast({
                              title: "Record Not Found",
                              description: "Could not find full pre-foreclosure record",
                              variant: "destructive",
                            });
                          }
                        } catch (error) {
                          console.error('Failed to fetch pre-foreclosure:', error);
                          toast({
                            title: "Error",
                            description: "Failed to load pre-foreclosure details",
                            variant: "destructive",
                          });
                        }
                        setSelectedProperty(null);
                      } else {
                        setSelectedProperty(property);
                        setSelectedPreForeclosure(null);
                      }
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="default"
                    size="default"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md hover:shadow-lg transition-all min-h-[44px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedForOutcome(property);
                      setSelectedOutcome(property.lastOutcome || '');
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Done
                  </Button>
                  <Button
                      variant="outline"
                      size="default"
                      className="border-destructive/50 hover:border-destructive hover:bg-destructive/10 text-destructive min-h-[44px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTask(property);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:flex items-center justify-between gap-6">
                {/* Checkbox (bulk mode) */}
                {bulkMode && (
                  <div className="flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(property.id)}
                      onChange={() => handleBulkToggle(property.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-5 w-5 rounded border-2 border-border cursor-pointer accent-primary"
                    />
                  </div>
                )}

                {/* Simplified Content: CALL HIGH LUCIANO MARKETVALUE/AMOUNT DUE */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Action Type */}
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <span className="text-base font-bold uppercase tracking-wide text-foreground">
                      {actionLabel.replace(/[📞💬✉️🚗]/g, '').trim()}
                    </span>
                  </div>

                  {/* Priority Badge */}
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold px-3 py-1 rounded-md border-2 min-w-[60px] text-center",
                      PRIORITY_COLORS[priority]
                    )}
                  >
                    {priority.toUpperCase()}
                  </Badge>

                  {/* Assigned To */}
                  {property.assignedTo && (
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {property.assignedTo}
                      </span>
                    </div>
                  )}

                  {/* Notes */}
                  {property.notes && property.notes.trim() && (
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground break-words whitespace-pre-wrap">
                        {property.notes}
                      </span>
                    </div>
                  )}

                  {/* Amount Due - Right aligned */}
                  <div className="ml-auto flex-shrink-0">
                    {property.totalAmountDue > 0 ? (
                      <span className="text-lg font-bold font-mono tracking-tight text-green-500">
                        {formatCurrency(property.totalAmountDue)}
                      </span>
                    ) : isPreForeclosureTask(property) && (property as any).type ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-sm font-semibold px-3 py-1 rounded-md border-2",
                          (property as any).type === 'Mortgage'
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                            : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                        )}
                      >
                        {(property as any).type}
                      </Badge>
                    ) : (
                      <span className="text-lg font-bold font-mono tracking-tight text-muted-foreground">
                        {formatCurrency(property.totalAmountDue)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* View Details Button */}
                  <Button
                    variant="outline"
                    size="default"
                    className="border-border hover:border-primary hover:bg-primary/10"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (isPreForeclosureTask(property)) {
                        const docNumber = (property as any).documentNumber || property.accountNumber;
                        // Fetch full pre-foreclosure record from backend
                        try {
                          const allRecords = await getPreForeclosures();
                          const fullRecord = allRecords.find(r => r.document_number === docNumber);
                          if (fullRecord) {
                            setSelectedPreForeclosure(fullRecord);
                          } else {
                            toast({
                              title: "Record Not Found",
                              description: "Could not find full pre-foreclosure record",
                              variant: "destructive",
                            });
                          }
                        } catch (error) {
                          console.error('Failed to fetch pre-foreclosure:', error);
                          toast({
                            title: "Error",
                            description: "Failed to load pre-foreclosure details",
                            variant: "destructive",
                          });
                        }
                        setSelectedProperty(null);
                      } else {
                        setSelectedProperty(property);
                        setSelectedPreForeclosure(null);
                      }
                    }}
                    title="View and edit details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  {/* Mark Done Button */}
                  <Button
                    variant="default"
                    size="default"
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 shadow-md hover:shadow-lg transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedForOutcome(property);
                      setSelectedOutcome(property.lastOutcome || '');
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Done
                  </Button>

                  {/* Delete Task Button */}
                  <Button
                    variant="outline"
                    size="default"
                    className="border-destructive/50 hover:border-destructive hover:bg-destructive/10 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTask(property);
                    }}
                    title="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Outcome Dialog */}
      <Dialog open={!!selectedForOutcome} onOpenChange={(open) => !open && setSelectedForOutcome(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Task as Done</DialogTitle>
            <DialogDescription>
              Select the outcome to create the next action automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Outcome</label>
              <Select value={selectedOutcome} onValueChange={(v) => setSelectedOutcome(v as Outcome)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedForOutcome(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedForOutcome && handleMarkDone(selectedForOutcome)}
                disabled={!selectedOutcome}
              >
                Mark Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PropertyDetailsModal
        property={selectedProperty}
        isOpen={!!selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />

      <PreForeclosureDetailsModal
        preforeclosure={selectedPreForeclosure}
        isOpen={!!selectedPreForeclosure}
        onClose={() => setSelectedPreForeclosure(null)}
        onUpdate={handlePreForeclosureUpdate}
      />
    </div>
  );
}
