import type { Lead, Task } from '@/crm/data/types'
import { TaskItem } from './TaskItem'

type TaskListProps = {
  tasks: Task[]
  leadById: Map<string, Lead>
  onComplete: (taskId: string) => void
  onLeadClick: (leadId: string) => void
  emptyMessage: string
}

export function TaskList({
  tasks,
  leadById,
  onComplete,
  onLeadClick,
  emptyMessage,
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <li key={task.id}>
          <TaskItem
            task={task}
            lead={leadById.get(task.leadId)}
            onComplete={() => onComplete(task.id)}
            onLeadClick={() => onLeadClick(task.leadId)}
          />
        </li>
      ))}
    </ul>
  )
}
