import { create } from 'zustand'
import { dataService } from '../data/dataService'
import {
  mergeNetworkState,
  replaceNetworkContacts,
  type NetworkContactRecord,
} from '../data/networkContacts'
import { generateSeed } from '../data/seed'
import { removeLegacyFakeFollowUps } from '../lib/tasks'
import {
  EMPTY_STATE,
  type Activity,
  type ActivityKind,
  type CrmState,
  type Deal,
  type Lead,
  type LeadKind,
  type PipelineStage,
  type Task,
} from '../data/types'

type NewLeadInput = Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt' | 'kind'> & {
  kind?: LeadKind
}
type NewOpportunityInput = Partial<Pick<Deal, 'stage' | 'value' | 'expectedCloseDate' | 'probability'>>
type NewTaskInput = Omit<Task, 'id' | 'completed' | 'completedAt'>

type Actions = {
  hydrate: (now: Date) => Promise<void>
  addLead: (input: NewLeadInput) => Lead
  updateLead: (id: string, patch: Partial<Lead>) => void
  setLeadKind: (leadId: string, kind: LeadKind) => void
  deleteLead: (id: string) => void
  createOpportunity: (leadId: string, input?: NewOpportunityInput) => Deal | null
  removeOpportunity: (leadId: string) => void
  moveOpportunityToRetail: (leadId: string) => void
  moveDealStage: (dealId: string, newStage: PipelineStage) => void
  updateDeal: (id: string, patch: Partial<Deal>) => void
  addTask: (input: NewTaskInput) => Task
  completeTask: (id: string) => void
  rescheduleTask: (id: string, dueAt: string) => void
  deleteTask: (id: string) => void
  addActivity: (leadId: string, kind: ActivityKind, body: string) => void
  setTheme: (theme: 'light' | 'dark') => void
  setDefaultRetailLetterCadence: (days: number) => void
  setDefaultOpportunityOutreachMessage: (message: string) => void
  resetToSeed: (now: Date) => void
  importNetworkContacts: (records: NetworkContactRecord[], now: Date) => void
  runStaleLeadAutomation: (now: Date) => void
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const nowIso = () => new Date().toISOString()
const OFFER_FOLLOW_UP_NOTE = 'Automation: follow up after Offer / LOI sent'

const persist = (state: CrmState) => {
  dataService.save(state)
}

const snapshot = (state: CrmState): CrmState => ({
  leads: state.leads,
  deals: state.deals,
  tasks: state.tasks,
  activities: state.activities,
  settings: state.settings,
})

export const useCrmStore = create<CrmState & Actions>((set, get) => ({
  ...EMPTY_STATE,

  hydrate: async (now) => {
    const stored = await dataService.load()
    if (stored) {
      const normalized: CrmState = {
        ...stored,
        leads: stored.leads.map((lead) => ({
          ...lead,
          kind: lead.kind ?? 'industry',
        })),
        settings: {
          theme: stored.settings?.theme ?? 'dark',
          defaultRetailLetterCadenceDays:
            stored.settings?.defaultRetailLetterCadenceDays ?? 90,
          defaultOpportunityOutreachMessage:
            stored.settings?.defaultOpportunityOutreachMessage ??
            "Hi, it was great meeting you. You mentioned you were thinking about buying — I'd love to sit down and chat to see how I can help. When would be a good time to connect?",
        },
      }
      const next = mergeNetworkState(normalized, now)
      set({ ...next })
      return
    }

    const seed = generateSeed(now)
    set({ ...seed })
  },

  addLead: (input) => {
    const createdAt = nowIso()
    const lead: Lead = {
      ...input,
      kind: input.kind ?? 'industry',
      id: uid(),
      lastContactedAt: null,
      createdAt,
    }

    const activity: Activity = {
      id: uid(),
      leadId: lead.id,
      kind: 'created',
      body: `Relationship created from ${lead.source}`,
      timestamp: createdAt,
    }

    const next: CrmState = {
      ...get(),
      leads: [...get().leads, lead],
      activities: [...get().activities, activity],
    }

    set(next)
    persist(snapshot(next))
    return lead
  },

  updateLead: (id, patch) => {
    const next: CrmState = {
      ...get(),
      leads: get().leads.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)),
    }

    set(next)
    persist(snapshot(next))
  },

  setLeadKind: (leadId, kind) => {
    const currentState = get()
    const lead = currentState.leads.find((entry) => entry.id === leadId)
    if (!lead || lead.kind === kind) return

    const timestamp = nowIso()
    const next: CrmState = {
      ...currentState,
      leads: currentState.leads.map((entry) =>
        entry.id === leadId ? { ...entry, kind } : entry,
      ),
      activities: [
        ...currentState.activities,
        {
          id: uid(),
          leadId,
          kind: 'stage-change',
          body: kind === 'retail' ? 'Moved to Retail' : 'Moved to Contacts',
          timestamp,
        },
      ],
    }

    set(next)
    persist(snapshot(next))
  },

  createOpportunity: (leadId, input = {}) => {
    const currentState = get()
    const lead = currentState.leads.find((entry) => entry.id === leadId)
    if (!lead) return null

    const existingDeal = currentState.deals.find((entry) => entry.leadId === leadId)
    if (existingDeal) return existingDeal

    const createdAt = nowIso()
    const deal: Deal = {
      id: uid(),
      leadId,
      stage: input.stage ?? 'New Prospect',
      value: input.value ?? 0,
      expectedCloseDate:
        input.expectedCloseDate ??
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      probability: input.probability ?? 20,
      createdAt,
      updatedAt: createdAt,
    }

    const activity: Activity = {
      id: uid(),
      leadId,
      kind: 'stage-change',
      body: 'Moved contact into Opportunities',
      timestamp: createdAt,
    }

    const next: CrmState = {
      ...currentState,
      deals: [...currentState.deals, deal],
      activities: [...currentState.activities, activity],
    }

    set(next)
    persist(snapshot(next))
    return deal
  },

  removeOpportunity: (leadId) => {
    const currentState = get()
    const deal = currentState.deals.find((entry) => entry.leadId === leadId)
    if (!deal) return

    const timestamp = nowIso()
    const next: CrmState = {
      ...currentState,
      deals: currentState.deals.filter((entry) => entry.leadId !== leadId),
      activities: [
        ...currentState.activities,
        {
          id: uid(),
          leadId,
          kind: 'stage-change',
          body: 'Moved opportunity back to Contacts',
          timestamp,
        },
      ],
    }

    set(next)
    persist(snapshot(next))
  },

  moveOpportunityToRetail: (leadId) => {
    const currentState = get()
    const deal = currentState.deals.find((entry) => entry.leadId === leadId)
    const lead = currentState.leads.find((entry) => entry.id === leadId)
    if (!lead) return

    const timestamp = nowIso()
    const next: CrmState = {
      ...currentState,
      deals: deal
        ? currentState.deals.filter((entry) => entry.leadId !== leadId)
        : currentState.deals,
      leads: currentState.leads.map((entry) =>
        entry.id === leadId ? { ...entry, kind: 'retail' } : entry,
      ),
      activities: [
        ...currentState.activities,
        {
          id: uid(),
          leadId,
          kind: 'stage-change',
          body: 'Moved opportunity to Retail',
          timestamp,
        },
      ],
    }

    set(next)
    persist(snapshot(next))
  },

  deleteLead: (id) => {
    const next: CrmState = {
      ...get(),
      leads: get().leads.filter((lead) => lead.id !== id),
      deals: get().deals.filter((deal) => deal.leadId !== id),
      tasks: get().tasks.filter((task) => task.leadId !== id),
      activities: get().activities.filter((activity) => activity.leadId !== id),
    }

    set(next)
    persist(snapshot(next))
  },

  moveDealStage: (dealId, newStage) => {
    const currentState = get()
    const deal = currentState.deals.find((entry) => entry.id === dealId)
    if (!deal || deal.stage === newStage) return

    const updatedAt = nowIso()
    const updatedDeal: Deal = {
      ...deal,
      stage: newStage,
      updatedAt,
      probability:
        newStage === 'Closed Won'
          ? 100
          : newStage === 'Archived'
            ? 0
            : deal.probability,
    }

    const stageChangeActivity: Activity = {
      id: uid(),
      leadId: deal.leadId,
      kind: 'stage-change',
      body: `Stage changed: ${deal.stage} -> ${newStage}`,
      timestamp: updatedAt,
    }

    const offerFollowUp =
      newStage === 'Offer / LOI' &&
      !currentState.tasks.some(
        (task) =>
          task.leadId === deal.leadId &&
          !task.completed &&
          task.notes === OFFER_FOLLOW_UP_NOTE,
      )
        ? {
            id: uid(),
            leadId: deal.leadId,
            type: 'Call' as const,
            dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
            completed: false,
            completedAt: null,
            notes: OFFER_FOLLOW_UP_NOTE,
          }
        : null

    const next: CrmState = {
      ...currentState,
      deals: currentState.deals.map((entry) =>
        entry.id === dealId ? updatedDeal : entry,
      ),
      tasks: offerFollowUp
        ? [...currentState.tasks, offerFollowUp]
        : currentState.tasks,
      activities: [...currentState.activities, stageChangeActivity],
    }

    set(next)
    persist(snapshot(next))
  },

  updateDeal: (id, patch) => {
    const next: CrmState = {
      ...get(),
      deals: get().deals.map((deal) =>
        deal.id === id ? { ...deal, ...patch, updatedAt: nowIso() } : deal,
      ),
    }

    set(next)
    persist(snapshot(next))
  },

  addTask: (input) => {
    const task: Task = {
      ...input,
      id: uid(),
      completed: false,
      completedAt: null,
    }

    const next: CrmState = { ...get(), tasks: [...get().tasks, task] }
    set(next)
    persist(snapshot(next))
    return task
  },

  rescheduleTask: (id, dueAt) => {
    const currentState = get()
    const task = currentState.tasks.find((entry) => entry.id === id)
    if (!task) return
    const next: CrmState = {
      ...currentState,
      tasks: currentState.tasks.map((entry) => (entry.id === id ? { ...entry, dueAt } : entry)),
    }
    set(next)
    persist(snapshot(next))
  },

  deleteTask: (id) => {
    const currentState = get()
    if (!currentState.tasks.some((entry) => entry.id === id)) return
    const next: CrmState = {
      ...currentState,
      tasks: currentState.tasks.filter((entry) => entry.id !== id),
    }
    set(next)
    persist(snapshot(next))
  },

  completeTask: (id) => {
    const currentState = get()
    const task = currentState.tasks.find((entry) => entry.id === id)
    if (!task || task.completed) return

    const completedAt = nowIso()
    const updatedTask: Task = { ...task, completed: true, completedAt }

    const next: CrmState = {
      ...currentState,
      leads: currentState.leads.map((lead) =>
        lead.id === task.leadId ? { ...lead, lastContactedAt: completedAt } : lead,
      ),
      tasks: currentState.tasks.map((entry) => (entry.id === id ? updatedTask : entry)),
      activities: [
        ...currentState.activities,
        {
          id: uid(),
          leadId: task.leadId,
          kind: 'task-completed',
          body: `Completed task: ${task.type}`,
          timestamp: completedAt,
        },
      ],
    }

    set(next)
    persist(snapshot(next))
  },

  addActivity: (leadId, kind, body) => {
    const timestamp = nowIso()
    const isTouchpoint =
      kind === 'call' || kind === 'text' || kind === 'visit' || kind === 'meeting'

    const next: CrmState = {
      ...get(),
      leads: isTouchpoint
        ? get().leads.map((lead) =>
            lead.id === leadId ? { ...lead, lastContactedAt: timestamp } : lead,
          )
        : get().leads,
      activities: [
        ...get().activities,
        {
          id: uid(),
          leadId,
          kind,
          body,
          timestamp,
        },
      ],
    }

    set(next)
    persist(snapshot(next))
  },

  setTheme: (theme) => {
    const next: CrmState = {
      ...get(),
      settings: { ...get().settings, theme },
    }

    set(next)
    persist(snapshot(next))
  },

  setDefaultRetailLetterCadence: (days) => {
    const safe = Math.max(1, Math.floor(days))
    const next: CrmState = {
      ...get(),
      settings: { ...get().settings, defaultRetailLetterCadenceDays: safe },
    }
    set(next)
    persist(snapshot(next))
  },

  setDefaultOpportunityOutreachMessage: (message) => {
    const next: CrmState = {
      ...get(),
      settings: { ...get().settings, defaultOpportunityOutreachMessage: message },
    }
    set(next)
    persist(snapshot(next))
  },

  resetToSeed: (now) => {
    const seed = generateSeed(now)
    set({ ...seed })
    persist(seed)
  },

  importNetworkContacts: (records, now) => {
    const next = replaceNetworkContacts(get(), records, now)
    set(next)
    persist(snapshot(next))
  },

  runStaleLeadAutomation: (now) => {
    const currentState = get()
    const currentTasks = removeLegacyFakeFollowUps(currentState.tasks)
    const newTasks: Task[] = []

    for (const lead of currentState.leads) {
      const hasOpenTask = currentTasks.some(
        (task) => task.leadId === lead.id && !task.completed,
      )
      if (hasOpenTask) continue

      if (lead.kind === 'retail') {
        const cadenceDays =
          lead.letterCadenceDays ??
          currentState.settings.defaultRetailLetterCadenceDays
        const lastTouch = lead.lastContactedAt
          ? new Date(lead.lastContactedAt).getTime()
          : new Date(lead.createdAt).getTime()
        if (now.getTime() - lastTouch < cadenceDays * 86400000) continue

        newTasks.push({
          id: uid(),
          leadId: lead.id,
          type: 'Send Letter',
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          completed: false,
          completedAt: null,
          notes: 'Automation: send periodic real estate letter',
        })
      }
    }

    if (newTasks.length === 0 && currentTasks.length === currentState.tasks.length) return

    const next: CrmState = {
      ...currentState,
      tasks: [...currentTasks, ...newTasks],
    }

    set(next)
    persist(snapshot(next))
  },
}))
