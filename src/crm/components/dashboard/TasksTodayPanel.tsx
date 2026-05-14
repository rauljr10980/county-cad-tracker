import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Lead, Task } from '@/crm/data/types'

type TasksTodayPanelProps = {
  tasks: Task[]
  leadById: Map<string, Lead>
  onLeadClick: (leadId: string) => void
}

const isSameDay = (iso: string, now: Date) =>
  new Date(iso).toDateString() === now.toDateString()

export function TasksTodayPanel({
  tasks,
  leadById,
  onLeadClick,
}: TasksTodayPanelProps) {
  const now = new Date()
  const todayTasks = tasks
    .filter((task) => !task.completed && isSameDay(task.dueAt, now))
    .sort((left, right) => +new Date(left.dueAt) - +new Date(right.dueAt))
    .slice(0, 6)

  return (
    <Card className="h-full border-border/70 bg-card/90">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Tasks Due Today
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {todayTasks.length === 0 ? (
          <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
            Nothing due today. The board is clear.
          </div>
        ) : null}
        {todayTasks.map((task) => {
          const lead = leadById.get(task.leadId)
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onLeadClick(task.leadId)}
              className="w-full rounded-md border border-border/70 bg-background/80 p-4 text-left transition hover:border-primary/40 hover:bg-accent/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{task.type}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lead?.businessName ?? 'Unknown contact'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(task.dueAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {task.notes ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {task.notes}
                </p>
              ) : null}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
