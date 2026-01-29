import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RotateCcw, CheckCircle, XCircle, ChevronDown, ChevronUp, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { PreForeclosureRecord, WorkflowStage, WorkflowLogEntry } from '@/types/property';
import { WORKFLOW_STAGES, STAGE_TASK_MAP } from '@/types/property';
import { useUpdatePreForeclosure } from '@/hooks/usePreForeclosure';

const STAGE_ORDER: WorkflowStage[] = [
  'not_started', 'initial_visit', 'people_search', 'call_owner',
  'land_records', 'visit_heirs', 'call_heirs', 'negotiating',
];

interface WorkflowTrackerProps {
  record: PreForeclosureRecord;
  onRecordUpdate: (updated: Partial<PreForeclosureRecord>) => void;
}

function getStoredActingAs(): 'Luciano' | 'Raul' | null {
  const v = localStorage.getItem('workflowActingAs');
  return v === 'Luciano' || v === 'Raul' ? v : null;
}

export function WorkflowTracker({ record, onRecordUpdate }: WorkflowTrackerProps) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdatePreForeclosure();
  const [stepNote, setStepNote] = useState('');
  const [logExpanded, setLogExpanded] = useState(false);
  const [actingAs, setActingAs] = useState<'Luciano' | 'Raul' | null>(
    () => record.assignedTo || getStoredActingAs()
  );

  const currentStage: WorkflowStage = (record.workflow_stage as WorkflowStage) || 'not_started';
  const workflowLog: WorkflowLogEntry[] = (record.workflow_log as WorkflowLogEntry[]) || [];
  const stageInfo = WORKFLOW_STAGES[currentStage] || WORKFLOW_STAGES.not_started;

  const handleActingAsChange = (person: 'Luciano' | 'Raul') => {
    setActingAs(person);
    localStorage.setItem('workflowActingAs', person);
  };

  const visitedStages = new Set<WorkflowStage>();
  visitedStages.add('not_started');
  for (const entry of workflowLog) {
    visitedStages.add(entry.fromStage);
    visitedStages.add(entry.toStage);
  }

  const handleAdvance = async (nextStage: WorkflowStage, outcomeLabel: string) => {
    const newEntry: WorkflowLogEntry = {
      id: crypto.randomUUID(),
      fromStage: currentStage,
      toStage: nextStage,
      outcome: outcomeLabel,
      note: stepNote.trim() || undefined,
      actingAs: actingAs || undefined,
      timestamp: new Date().toISOString(),
    };
    const updatedLog = [...workflowLog, newEntry];

    // Auto-task: look up task for the next stage
    const taskRule = STAGE_TASK_MAP[nextStage];
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const taskFields = taskRule
      ? {
          actionType: taskRule.actionType as 'call' | 'text' | 'mail' | 'driveby',
          priority: taskRule.priority as 'high' | 'med' | 'low',
          dueTime: today.toISOString(),
          assignedTo: actingAs as 'Luciano' | 'Raul' | null,
        }
      : {
          actionType: null as null,
          priority: null as null,
          dueTime: null as null,
          assignedTo: null as null,
        };

    try {
      await updateMutation.mutateAsync({
        document_number: record.document_number,
        workflow_stage: nextStage,
        workflow_log: updatedLog,
        ...taskFields,
      });
      onRecordUpdate({ workflow_stage: nextStage, workflow_log: updatedLog, ...taskFields });
      setStepNote('');
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Workflow Updated', description: `Moved to: ${WORKFLOW_STAGES[nextStage].label}` });
    } catch {
      toast({ title: 'Error', description: 'Failed to update workflow', variant: 'destructive' });
    }
  };

  const handleReset = async () => {
    const newEntry: WorkflowLogEntry = {
      id: crypto.randomUUID(),
      fromStage: currentStage,
      toStage: 'not_started',
      outcome: 'Workflow Reset',
      actingAs: actingAs || undefined,
      timestamp: new Date().toISOString(),
    };
    const updatedLog = [...workflowLog, newEntry];

    try {
      await updateMutation.mutateAsync({
        document_number: record.document_number,
        workflow_stage: 'not_started',
        workflow_log: updatedLog,
        actionType: null,
        priority: null,
        dueTime: null,
        assignedTo: null,
      });
      onRecordUpdate({
        workflow_stage: 'not_started',
        workflow_log: updatedLog,
        actionType: undefined,
        priority: undefined,
        dueTime: undefined,
        assignedTo: undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Workflow Reset', description: 'Workflow has been restarted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to reset workflow', variant: 'destructive' });
    }
  };

  return (
    <div className="bg-secondary/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Deal Workflow</span>
        {currentStage !== 'not_started' && (
          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={handleReset} disabled={updateMutation.isPending}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Acting As selector */}
      <div className="flex items-center gap-2">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Acting as:</span>
        <div className="flex gap-1">
          {(['Luciano', 'Raul'] as const).map((person) => (
            <Button
              key={person}
              size="sm"
              variant={actingAs === person ? 'default' : 'outline'}
              className={cn(
                'h-6 text-xs px-2.5',
                actingAs === person && person === 'Luciano' && 'bg-green-600 hover:bg-green-700',
                actingAs === person && person === 'Raul' && 'bg-orange-600 hover:bg-orange-700',
              )}
              onClick={() => handleActingAsChange(person)}
            >
              {person}
            </Button>
          ))}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0.5 overflow-x-auto pb-2">
        {STAGE_ORDER.map((stageKey, i) => {
          const isCurrent = stageKey === currentStage;
          const isVisited = visitedStages.has(stageKey);
          const isDeadEnd = currentStage === 'dead_end';
          return (
            <div key={stageKey} className="flex items-center">
              {i > 0 && (
                <div className={cn('h-0.5 w-4 sm:w-6', isVisited && !isDeadEnd ? 'bg-primary' : 'bg-muted')} />
              )}
              <div className="flex flex-col items-center min-w-[44px]">
                <div className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-medium transition-all',
                  isCurrent && 'ring-2 ring-primary ring-offset-1 ring-offset-background border-primary bg-primary text-primary-foreground',
                  isVisited && !isCurrent && 'bg-primary/20 border-primary/50 text-primary',
                  !isVisited && !isCurrent && 'border-muted bg-muted/30 text-muted-foreground',
                )}>
                  {i + 1}
                </div>
                <span className={cn(
                  'text-[9px] mt-1 text-center leading-tight',
                  isCurrent ? 'text-primary font-medium' : 'text-muted-foreground',
                )}>
                  {WORKFLOW_STAGES[stageKey].shortLabel}
                </span>
              </div>
            </div>
          );
        })}
        {/* Dead end indicator */}
        {currentStage === 'dead_end' && (
          <div className="flex items-center">
            <div className="h-0.5 w-4 bg-red-500/50" />
            <div className="flex flex-col items-center min-w-[44px]">
              <div className="w-6 h-6 rounded-full border-2 border-red-500 bg-red-500/20 flex items-center justify-center ring-2 ring-red-500 ring-offset-1 ring-offset-background">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              </div>
              <span className="text-[9px] mt-1 text-red-400 font-medium">Dead End</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Panel */}
      <div className="border border-border rounded-lg p-3 space-y-3">
        {stageInfo.terminal ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2">
              {stageInfo.terminalType === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className={cn(
                'text-lg font-semibold',
                stageInfo.terminalType === 'success' ? 'text-green-400' : 'text-red-400',
              )}>
                {stageInfo.label}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} className="mt-3" disabled={updateMutation.isPending}>
              <RotateCcw className="h-3 w-3 mr-1" /> Restart Workflow
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">{stageInfo.label}</p>
            {stageInfo.question && (
              <p className="text-sm text-muted-foreground">{stageInfo.question}</p>
            )}
            {!actingAs && (
              <p className="text-xs text-amber-400">Select who you are above before proceeding.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {stageInfo.outcomes?.map((outcome) => (
                <Button
                  key={outcome.nextStage}
                  size="sm"
                  variant={outcome.nextStage === 'negotiating' ? 'default' : 'outline'}
                  onClick={() => handleAdvance(outcome.nextStage, outcome.label)}
                  disabled={updateMutation.isPending || !actingAs}
                >
                  {outcome.label}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Add a note for this step (optional)..."
              value={stepNote}
              onChange={(e) => setStepNote(e.target.value)}
              className="text-sm h-8"
            />
          </>
        )}
      </div>

      {/* History Log */}
      {workflowLog.length > 0 && (
        <div>
          <button
            onClick={() => setLogExpanded(!logExpanded)}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {logExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            History ({workflowLog.length} {workflowLog.length === 1 ? 'entry' : 'entries'})
          </button>
          {logExpanded && (
            <div className="space-y-1 mt-2">
              {workflowLog.slice().reverse().map((entry) => (
                <div key={entry.id} className="border-l-2 border-muted pl-3 py-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">
                      {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
                    </span>
                    <span className="mx-1.5 text-muted-foreground">-</span>
                    <span className="font-medium">{entry.outcome}</span>
                    <span className="text-muted-foreground ml-1">
                      ({WORKFLOW_STAGES[entry.fromStage]?.shortLabel || entry.fromStage} &rarr; {WORKFLOW_STAGES[entry.toStage]?.shortLabel || entry.toStage})
                    </span>
                  </div>
                  {entry.actingAs && (
                    <span className="text-muted-foreground ml-1">by {entry.actingAs}</span>
                  )}
                  {entry.note && (
                    <p className="text-muted-foreground italic mt-0.5">"{entry.note}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
