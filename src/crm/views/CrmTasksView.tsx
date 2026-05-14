import { useMemo, useState } from 'react'
import { LeadDetailDrawer } from '@/crm/components/leads/LeadDetailDrawer'
import { useSearchStore } from '@/crm/lib/searchStore'
import { TaskList } from '@/crm/components/tasks/TaskList'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCrmStore } from '@/crm/store/useCrmStore'

const isSameDay = (iso: string, now: Date) =>
  new Date(iso).toDateString() === now.toDateString()

export default function CrmTasksView() {
  const tasks = useCrmStore((state) => state.tasks)
  const leads = useCrmStore((state) => state.leads)
  const completeTask = useCrmStore((state) => state.completeTask)
  const query = useSearchStore((state) => state.query).trim().toLowerCase()
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [lettersOnly, setLettersOnly] = useState(false)

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])
  const now = new Date()

  const openTasks = useMemo(() => {
    return tasks
      .filter((task) => !task.completed)
      .filter((task) => (lettersOnly ? task.type === 'Send Letter' : true))
      .filter((task) => {
        if (!query) return true
        const lead = leadById.get(task.leadId)
        return `${task.type} ${task.notes} ${lead?.businessName ?? ''} ${lead?.ownerName ?? ''}`
          .toLowerCase()
          .includes(query)
      })
      .sort((left, right) => +new Date(left.dueAt) - +new Date(right.dueAt))
  }, [leadById, lettersOnly, query, tasks])

  const today = openTasks.filter((task) => isSameDay(task.dueAt, now))
  const overdue = openTasks.filter(
    (task) => new Date(task.dueAt).getTime() < now.getTime() && !isSameDay(task.dueAt, now),
  )
  const upcoming = openTasks.filter(
    (task) => new Date(task.dueAt).getTime() > now.getTime() && !isSameDay(task.dueAt, now),
  )

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Follow-Ups</h1>
          <p className="text-sm text-muted-foreground">
            {openTasks.length} open follow-ups, {overdue.length} overdue, all tied back to contacts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={lettersOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLettersOnly((value) => !value)}
          >
            Letters due
          </Button>
        </div>
      </div>

      <Tabs defaultValue="today" className="space-y-4">
        <TabsList>
          <TabsTrigger value="today">Today ({today.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <TaskList
            tasks={today}
            leadById={leadById}
            onComplete={completeTask}
            onLeadClick={(leadId) => setOpenLeadId(leadId)}
            emptyMessage="Nothing due today."
          />
        </TabsContent>
        <TabsContent value="upcoming">
          <TaskList
            tasks={upcoming}
            leadById={leadById}
            onComplete={completeTask}
            onLeadClick={(leadId) => setOpenLeadId(leadId)}
            emptyMessage="No upcoming tasks."
          />
        </TabsContent>
        <TabsContent value="overdue">
          <TaskList
            tasks={overdue}
            leadById={leadById}
            onComplete={completeTask}
            onLeadClick={(leadId) => setOpenLeadId(leadId)}
            emptyMessage="Caught up. No overdue tasks."
          />
        </TabsContent>
      </Tabs>

      <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
    </div>
  )
}
