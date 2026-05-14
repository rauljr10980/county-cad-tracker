import type { Task } from '@/data/types'

const LEGACY_FAKE_FOLLOW_UP_NOTES = new Set([
  'Auto-generated: no relationship touch for 3+ days',
  'Follow up with new real estate prospect',
])

export const isLegacyFakeFollowUpTask = (task: Task): boolean =>
  task.type === 'Call' && LEGACY_FAKE_FOLLOW_UP_NOTES.has(task.notes.trim())

export const removeLegacyFakeFollowUps = (tasks: Task[]): Task[] =>
  tasks.filter((task) => !isLegacyFakeFollowUpTask(task))
