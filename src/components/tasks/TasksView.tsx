import { useState, useMemo } from 'react';
import { Phone, MessageSquare, Mail, Car, CheckSquare, Loader2, AlertCircle, Eye, Clock, Flag, Filter, CheckCircle2, X } from 'lucide-react';
import { Property, PreForeclosure } from '@/types/property';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTasks, updatePropertyAction, markTaskDone, updatePropertyPriority, updatePreForeclosure } from '@/lib/api';
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
  const [sortBy, setSortBy] = useState<'urgency' | 'action' | 'overdue'>('urgency');
  const [updatingPriority, setUpdatingPriority] = useState<Set<string>>(new Set());
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState<{ [key: string]: boolean }>({});

  // Helper to check if a task is from a pre-foreclosure (has documentNumber)
  const isPreForeclosureTask = (task: Property): boolean => {
    return !!(task as any).documentNumber;
  };

  // Convert Property to PreForeclosure format
  const propertyToPreForeclosure = (property: Property): PreForeclosure => {
    return {
      document_number: (property as any).documentNumber || property.accountNumber,
      type: 'Mortgage' as const, // Default, could be enhanced
      address: property.propertyAddress || '',
      city: (property as any).city || '',
      zip: (property as any).zip || '',
      filing_month: '',
      county: 'Bexar',
      internal_status: (property.status === 'UNKNOWN' ? 'New' : property.status) as any,
      notes: property.notes || undefined,
      phoneNumbers: property.phoneNumbers,
      ownerPhoneIndex: property.ownerPhoneIndex,
      actionType: property.actionType,
      priority: property.priority,
      dueTime: property.dueTime,
      assignedTo: property.assignedTo,
      first_seen_month: '',
      last_seen_month: '',
      inactive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

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
  }, [data, filterMode, sortBy]);

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
      {/* Task Summary Cards */}
      <div className="mb-6 bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Tasks & Actions Overview</h3>
        <div className="space-y-4">
          {[
            { label: 'Total Tasks', count: taskStats.total, color: '#3B82F6', icon: '📋' },
            { label: 'Luciano', count: taskStats.luciano, color: '#10B981', icon: '👤' },
            { label: 'Raul', count: taskStats.raul, color: '#F59E0B', icon: '👤' },
          ].map((task, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{task.icon}</span>
                  <span className="text-muted-foreground">{task.label}</span>
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
                    width: `${Math.min((task.count / Math.max(taskStats.total, 1)) * 100, 100)}%`
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
                "bg-card border border-border rounded-lg p-5 hover:border-primary/50 hover:shadow-md transition-all shadow-sm",
                bulkMode && "cursor-pointer",
                selectedIds.has(property.id) && "border-primary bg-primary/5 shadow-md"
              )}
              onClick={() => bulkMode && handleBulkToggle(property.id)}
            >
              <div className="flex items-center justify-between gap-6">
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
                    <div className="flex items-center gap-2 flex-1 min-w-0 max-w-[300px]">
                      <span className="text-sm text-muted-foreground truncate" title={property.notes}>
                        {property.notes}
                      </span>
                    </div>
                  )}

                  {/* Amount Due - Right aligned */}
                  <div className="ml-auto flex-shrink-0">
                    <span className={cn(
                      "text-lg font-bold font-mono tracking-tight",
                      property.totalAmountDue > 0 ? "text-green-500" : "text-muted-foreground"
                    )}>
                      {formatCurrency(property.totalAmountDue)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* View Details Button */}
                  <Button
                    variant="outline"
                    size="default"
                    className="border-border hover:border-primary hover:bg-primary/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isPreForeclosureTask(property)) {
                        setSelectedPreForeclosure(propertyToPreForeclosure(property));
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
