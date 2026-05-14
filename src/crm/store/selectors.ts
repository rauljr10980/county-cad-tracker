import type { CrmState, Deal, Lead, PipelineStage, Settings } from '../data/types'

const INACTIVE_STAGES: PipelineStage[] = ['Archived', 'Closed Won']

const isActiveDeal = (deal: Deal): boolean => !INACTIVE_STAGES.includes(deal.stage)

const activeDealLeadIds = (state: CrmState): Set<string> =>
  new Set(state.deals.filter(isActiveDeal).map((deal) => deal.leadId))

export const selectContacts = (state: CrmState): Lead[] => {
  const active = activeDealLeadIds(state)
  return state.leads.filter((lead) => lead.kind === 'industry' && !active.has(lead.id))
}

export const selectRetail = (state: CrmState): Lead[] => {
  const active = activeDealLeadIds(state)
  return state.leads.filter((lead) => lead.kind === 'retail' && !active.has(lead.id))
}

export const selectOpportunities = (state: CrmState): Lead[] => {
  const active = activeDealLeadIds(state)
  return state.leads.filter((lead) => active.has(lead.id))
}

export const effectiveLetterCadenceDays = (lead: Lead, settings: Settings): number =>
  lead.letterCadenceDays ?? settings.defaultRetailLetterCadenceDays
