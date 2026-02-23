import { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, addMonths, subMonths, isPast,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Check, Trash2, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFollowUps, useUpdateFollowUp, useDeleteFollowUp } from '@/hooks/useFollowUps';
import { WORKFLOW_STAGES } from '@/types/property';
import type { FollowUp, WorkflowStage } from '@/types/property';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const STAGE_COLORS: Record<string, string> = {
  negotiating: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  comps: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  sent_offer: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function getAddress(followUp: FollowUp): string {
  if (followUp.property) {
    const name = followUp.property.ownerName || '';
    if (/^\d/.test(name)) return name;
    return followUp.property.propertyAddress || name || 'Unknown';
  }
  if (followUp.preForeclosure) {
    return followUp.preForeclosure.address || 'Unknown';
  }
  return 'Unknown';
}

function getStageLabel(followUp: FollowUp): string {
  const stage = followUp.property?.workflowStage || followUp.preForeclosure?.workflowStage || '';
  return WORKFLOW_STAGES[stage as WorkflowStage]?.shortLabel || stage || '';
}

function getType(followUp: FollowUp): 'property' | 'preforeclosure' {
  return followUp.propertyId ? 'property' : 'preforeclosure';
}

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthKey = format(currentMonth, 'yyyy-MM');
  const { data: followUps, isLoading } = useFollowUps(monthKey);
  const updateMutation = useUpdateFollowUp();
  const deleteMutation = useDeleteFollowUp();

  // Build calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Group follow-ups by date
  const followUpsByDate = useMemo(() => {
    const map = new Map<string, FollowUp[]>();
    for (const fu of followUps || []) {
      const key = format(new Date(fu.date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(fu);
    }
    return map;
  }, [followUps]);

  // Follow-ups for selected day
  const selectedDayFollowUps = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return followUpsByDate.get(key) || [];
  }, [selectedDay, followUpsByDate]);

  // Stats
  const totalPending = useMemo(() => {
    return (followUps || []).filter(f => !f.completed).length;
  }, [followUps]);

  const totalCompleted = useMemo(() => {
    return (followUps || []).filter(f => f.completed).length;
  }, [followUps]);

  const handleToggleComplete = async (followUp: FollowUp) => {
    try {
      await updateMutation.mutateAsync({
        id: followUp.id,
        completed: !followUp.completed,
      });
      toast({
        title: followUp.completed ? 'Marked as pending' : 'Marked as complete',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update follow-up', variant: 'destructive' });
    }
  };

  const handleDelete = async (followUp: FollowUp) => {
    try {
      await deleteMutation.mutateAsync(followUp.id);
      toast({ title: 'Follow-up deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete follow-up', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Follow-Up Calendar
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalPending} pending{totalCompleted > 0 ? ` · ${totalCompleted} completed` : ''} this month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            className="font-semibold text-base min-w-[160px]"
            onClick={() => setCurrentMonth(new Date())}
          >
            {format(currentMonth, 'MMMM yyyy')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Calendar Grid */}
      {!isLoading && (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-secondary/50">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="p-2 sm:p-3 text-center text-xs sm:text-sm font-medium text-muted-foreground border-b border-border">
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayFollowUps = followUpsByDate.get(dateKey) || [];
              const pendingCount = dayFollowUps.filter(f => !f.completed).length;
              const completedCount = dayFollowUps.filter(f => f.completed).length;
              const hasFollowUps = dayFollowUps.length > 0;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const dayIsPast = isPast(day) && !isToday(day);

              return (
                <div
                  key={dateKey}
                  onClick={() => hasFollowUps ? setSelectedDay(day) : undefined}
                  className={cn(
                    'relative border-b border-r border-border p-1.5 sm:p-2 min-h-[70px] sm:min-h-[90px] transition-colors',
                    !isCurrentMonth && 'bg-secondary/20 opacity-40',
                    isCurrentMonth && 'bg-card',
                    isToday(day) && 'ring-2 ring-primary ring-inset bg-primary/5',
                    hasFollowUps && 'cursor-pointer hover:bg-secondary/50',
                    isSelected && 'bg-primary/10',
                    // Right border removed on last column
                    (i + 1) % 7 === 0 && 'border-r-0',
                  )}
                >
                  {/* Day number */}
                  <span className={cn(
                    'text-xs sm:text-sm font-medium',
                    isToday(day) && 'text-primary font-bold',
                    dayIsPast && !hasFollowUps && 'text-muted-foreground',
                  )}>
                    {format(day, 'd')}
                  </span>

                  {/* Follow-up indicators */}
                  {hasFollowUps && (
                    <div className="mt-1 space-y-0.5">
                      {/* Show up to 3 follow-up previews on desktop */}
                      {dayFollowUps.slice(0, 3).map(fu => (
                        <div
                          key={fu.id}
                          className={cn(
                            'hidden sm:block text-[10px] leading-tight px-1 py-0.5 rounded truncate',
                            fu.completed
                              ? 'bg-green-500/10 text-green-400 line-through'
                              : 'bg-blue-500/10 text-blue-400',
                          )}
                        >
                          {getAddress(fu)}
                        </div>
                      ))}
                      {dayFollowUps.length > 3 && (
                        <div className="hidden sm:block text-[10px] text-muted-foreground px-1">
                          +{dayFollowUps.length - 3} more
                        </div>
                      )}
                      {/* Mobile: just show dots */}
                      <div className="sm:hidden flex gap-1 mt-0.5">
                        {pendingCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            {pendingCount > 1 && <span className="text-[10px] text-blue-400">{pendingCount}</span>}
                          </span>
                        )}
                        {completedCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <span className="w-2 h-2 rounded-full bg-green-500/50" />
                            {completedCount > 1 && <span className="text-[10px] text-green-400">{completedCount}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedDay ? format(selectedDay, 'EEEE, MMMM d, yyyy') : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {selectedDayFollowUps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No follow-ups for this day</p>
            )}
            {selectedDayFollowUps.map(fu => {
              const address = getAddress(fu);
              const stageLabel = getStageLabel(fu);
              const stage = fu.property?.workflowStage || fu.preForeclosure?.workflowStage || '';
              const type = getType(fu);

              return (
                <div
                  key={fu.id}
                  className={cn(
                    'rounded-lg border p-3 transition-all',
                    fu.completed
                      ? 'border-green-500/20 bg-green-500/5 opacity-70'
                      : 'border-border bg-card',
                  )}
                >
                  {/* Address */}
                  <p className={cn(
                    'font-medium text-sm',
                    fu.completed && 'line-through text-muted-foreground',
                  )}>
                    {address}
                  </p>

                  {/* Stage + Type badges */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {stageLabel && (
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0', STAGE_COLORS[stage] || 'bg-secondary')}
                      >
                        {stageLabel}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {type === 'preforeclosure' ? 'Pre-FC' : 'Property'}
                    </Badge>
                    {fu.preForeclosure?.type && (
                      <Badge variant="outline" className={cn(
                        'text-[10px] px-1.5 py-0',
                        fu.preForeclosure.type === 'Mortgage'
                          ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                          : 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                      )}>
                        {fu.preForeclosure.type}
                      </Badge>
                    )}
                  </div>

                  {/* Note */}
                  {fu.note && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{fu.note}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant={fu.completed ? 'outline' : 'default'}
                      size="sm"
                      className={cn(
                        'flex-1 text-xs',
                        !fu.completed && 'bg-green-600 hover:bg-green-700',
                      )}
                      disabled={updateMutation.isPending}
                      onClick={() => handleToggleComplete(fu)}
                    >
                      {fu.completed ? (
                        <><Undo2 className="h-3 w-3 mr-1" /> Undo</>
                      ) : (
                        <><Check className="h-3 w-3 mr-1" /> Complete</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-destructive/50 hover:border-destructive hover:bg-destructive/10 text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(fu)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
