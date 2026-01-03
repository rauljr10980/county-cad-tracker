import { useState, useMemo } from 'react';
import { Phone, MessageSquare, Mail, Car, CheckSquare, Loader2, AlertCircle, Eye, Clock, Flag, Filter, CheckCircle2, X } from 'lucide-react';
import { Property } from '@/types/property';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTasks, updatePropertyAction, markTaskDone, updatePropertyPriority } from '@/lib/api';
import { format, isToday, isPast, parseISO, startOfDay, isBefore, isAfter } from 'date-fns';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';

type ActionType = 'call' | 'text' | 'mail' | 'driveby';
type Priority = 'high' | 'med' | 'low';
type Outcome = 'no_answer' | 'voicemail' | 'text_sent' | 'spoke_owner' | 'wrong_number' | 'not_interested' | 'new_owner' | 'call_back_later';
type FilterMode = 'all' | 'calls_only' | 'hot_today' | 'overdue';

const ACTION_ICONS = {
  call: Phone,
  text: MessageSquare,
  mail: Mail,
  driveby: Car,
};

const ACTION_LABELS = {
  call: 'Call',
  text: 'Text',
  mail: 'Mail',
  driveby: 'Drive by',
};

const PRIORITY_COLORS = {
  high: 'bg-red-500/20 text-red-500 border-red-500/30',
  med: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
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
  const [selectedForOutcome, setSelectedForOutcome] = useState<Property | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | ''>('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortBy, setSortBy] = useState<'urgency' | 'action' | 'overdue'>('urgency');
  const [updatingPriority, setUpdatingPriority] = useState<Set<string>>(new Set());
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState<{ [key: string]: boolean }>({});

  const { data, isLoading, error, refetch } = useQuery<Property[]>({
    queryKey: ['tasks'],
    queryFn: getTasks,
    refetchOnMount: true,
    refetchInterval: 30000,
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

    // Apply filters
    if (filterMode === 'calls_only') {
      filtered = filtered.filter(p => p.actionType === 'call');
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
  }, [data, filterMode, sortBy]);

  // Task summary stats (matching dashboard)
  const taskStats = useMemo(() => {
    const tasksData = data || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    return {
      callsDueToday: tasksData.filter(p =>
        p.actionType === 'call' &&
        p.dueTime &&
        new Date(p.dueTime) >= today &&
        new Date(p.dueTime) <= todayEnd
      ).length,
      followUpsThisWeek: tasksData.filter(p =>
        p.dueTime &&
        new Date(p.dueTime) >= today &&
        new Date(p.dueTime) <= weekFromNow
      ).length,
      textsScheduled: tasksData.filter(p =>
        p.actionType === 'text' &&
        p.dueTime &&
        new Date(p.dueTime) >= today
      ).length,
      mailCampaignActive: tasksData.filter(p =>
        p.actionType === 'mail' &&
        p.dueTime &&
        new Date(p.dueTime) >= today
      ).length,
      drivebyPlanned: tasksData.filter(p =>
        p.actionType === 'driveby' &&
        p.dueTime &&
        new Date(p.dueTime) >= today
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

  if (tasks.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-secondary/30 rounded-lg p-12 text-center">
          <CheckSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Tasks</h3>
          <p className="text-muted-foreground">
            Set action types and due times on properties to see them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Task Summary Cards (matching dashboard) */}
      <div className="mb-6 bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Tasks & Actions Overview</h3>
        <div className="space-y-4">
          {[
            { action: 'Calls Due Today', count: taskStats.callsDueToday, color: '#EF4444', icon: '📞' },
            { action: 'Follow-ups This Week', count: taskStats.followUpsThisWeek, color: '#F59E0B', icon: '📅' },
            { action: 'Texts Scheduled', count: taskStats.textsScheduled, color: '#8B5CF6', icon: '💬' },
            { action: 'Mail Campaign Active', count: taskStats.mailCampaignActive, color: '#3B82F6', icon: '✉️' },
            { action: 'Drive-bys Planned', count: taskStats.drivebyPlanned, color: '#10B981', icon: '🚗' },
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
      </div>

      {/* Performance Stats */}
      <div className="mb-6 bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Today's Performance</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-primary">{todayStats.completed}</p>
            <p className="text-xs text-muted-foreground">Tasks Completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{todayStats.contacts}</p>
            <p className="text-xs text-muted-foreground">Contacts Made</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{todayStats.warm}</p>
            <p className="text-xs text-muted-foreground">Warm Conversations</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{todayStats.followUps}</p>
            <p className="text-xs text-muted-foreground">Follow-ups Created</p>
          </div>
        </div>
      </div>

      {/* Header Controls */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Action Queue</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredAndSortedTasks.length} task{filteredAndSortedTasks.length !== 1 ? 's' : ''} ready for action
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="calls_only">Calls Only</SelectItem>
              <SelectItem value="hot_today">Hot Today</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[140px]">
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
            size="sm"
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
      <div className="space-y-2">
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
                "bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all",
                bulkMode && "cursor-pointer",
                selectedIds.has(property.id) && "border-primary bg-primary/5"
              )}
              onClick={() => bulkMode && handleBulkToggle(property.id)}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox (bulk mode) */}
                {bulkMode && (
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(property.id)}
                      onChange={() => handleBulkToggle(property.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                  </div>
                )}

                {/* Action Type Icon */}
                <div className="shrink-0 pt-1">
                  <div className="flex items-center gap-2">
                    <ActionIcon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{actionLabel}</span>
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold">{ownerName || property.ownerName}</span>
                        {city && <span className="text-sm text-muted-foreground">• {city}</span>}
                        <StatusBadge status={property.status} size="sm" />
                        <Popover
                          open={priorityPopoverOpen[property.id] || false}
                          onOpenChange={(open) => {
                            setPriorityPopoverOpen(prev => ({ ...prev, [property.id]: open }));
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs cursor-pointer transition-all hover:scale-105",
                                PRIORITY_COLORS[priority],
                                updatingPriority.has(property.id) && "opacity-50 animate-pulse"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPriorityPopoverOpen(prev => ({ ...prev, [property.id]: true }));
                              }}
                            >
                              {updatingPriority.has(property.id) ? '...' : priority.toUpperCase()}
                            </Badge>
                          </PopoverTrigger>
                          <PopoverContent className="w-40 p-2" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-1">
                              <button
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                                  priority === 'high' 
                                    ? "bg-red-500/20 text-red-500 font-medium" 
                                    : "hover:bg-secondary"
                                )}
                                onClick={() => handlePriorityChange(property, 'high')}
                              >
                                High
                              </button>
                              <button
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                                  priority === 'med' 
                                    ? "bg-yellow-500/20 text-yellow-500 font-medium" 
                                    : "hover:bg-secondary"
                                )}
                                onClick={() => handlePriorityChange(property, 'med')}
                              >
                                Medium
                              </button>
                              <button
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                                  priority === 'low' 
                                    ? "bg-blue-500/20 text-blue-500 font-medium" 
                                    : "hover:bg-secondary"
                                )}
                                onClick={() => handlePriorityChange(property, 'low')}
                              >
                                Low
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        {status.icon && <span className="text-lg">{status.icon}</span>}
                        {property.attempts && property.attempts > 0 && (
                          <span className="text-xs text-muted-foreground">
                            📞 x{property.attempts}
                          </span>
                        )}
                        {property.lastOutcome && (
                          <span className="text-xs text-muted-foreground">
                            Last: {OUTCOME_OPTIONS.find(o => o.value === property.lastOutcome)?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {address || property.propertyAddress}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono font-semibold text-judgment mb-1">
                        {formatCurrency(property.totalAmountDue)}
                      </p>
                      {dueTime && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{format(dueTime, 'MMM d, h:mm a')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProperty(property);
                    }}
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedForOutcome(property);
                      setSelectedOutcome(property.lastOutcome || '');
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Mark Done
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
    </div>
  );
}
