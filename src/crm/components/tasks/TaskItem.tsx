import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Lead, Task } from '@/crm/data/types'

type TaskItemProps = {
  task: Task
  lead?: Lead
  onComplete: () => void
  onLeadClick: () => void
}

export function TaskItem({ task, lead, onComplete, onLeadClick }: TaskItemProps) {
  const dueDate = new Date(task.dueAt)
  const isOverdue = !task.completed && dueDate.getTime() < Date.now()

  return (
    <div className="rounded-md border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => !task.completed && onComplete()}
            className="mt-1 h-4 w-4"
          />
          <div>
            <p
              className={
                task.completed
                  ? 'text-sm text-muted-foreground line-through'
                  : 'text-sm font-medium'
              }
            >
              {task.type}
            </p>
            <Button
              variant="link"
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={onLeadClick}
            >
              {lead?.businessName ?? 'Unknown contact'}
            </Button>
            {task.notes ? (
              <p className="mt-2 text-sm text-muted-foreground">{task.notes}</p>
            ) : null}
          </div>
        </div>
        <Badge variant={isOverdue ? 'destructive' : 'outline'}>
          {dueDate.toLocaleString()}
        </Badge>
      </div>
    </div>
  )
}
