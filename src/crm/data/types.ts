export type Industry =
  | 'Corporate Buyer'
  | 'Corporate Seller'
  | 'Tenant Rep'
  | 'Landlord Rep'
  | 'Investor'
  | 'Developer'
  | 'Referral Partner'
  | 'Other'
export const INDUSTRIES: Industry[] = [
  'Corporate Buyer',
  'Corporate Seller',
  'Tenant Rep',
  'Landlord Rep',
  'Investor',
  'Developer',
  'Referral Partner',
  'Other',
]

export type Source =
  | 'Referral'
  | 'Past Client'
  | 'Networking'
  | 'LinkedIn'
  | 'Website'
  | 'Cold Outreach'
  | 'Event'
  | 'Database'
export const SOURCES: Source[] = [
  'Referral',
  'Past Client',
  'Networking',
  'LinkedIn',
  'Website',
  'Cold Outreach',
  'Event',
  'Database',
]

export type WebsiteStatus = 'Immediate' | 'This Week' | 'This Month' | 'Nurture'
export const WEBSITE_STATUSES: WebsiteStatus[] = [
  'Immediate',
  'This Week',
  'This Month',
  'Nurture',
]

export type AgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+'
export const AGE_RANGES: AgeRange[] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']

export type LeadKind = 'industry' | 'retail'
export const LEAD_KINDS: LeadKind[] = ['industry', 'retail']

export type ConnectionRating = 'none' | 'great' | 'workable' | 'low-effort'
export const CONNECTION_RATINGS: ConnectionRating[] = [
  'none',
  'great',
  'workable',
  'low-effort',
]

export type PipelineStage =
  | 'New Prospect'
  | 'Qualified'
  | 'Property Search'
  | 'Touring'
  | 'Offer / LOI'
  | 'Negotiating'
  | 'Under Contract'
  | 'Closed Won'
  | 'Archived'

export const PIPELINE_STAGES: PipelineStage[] = [
  'New Prospect',
  'Qualified',
  'Property Search',
  'Touring',
  'Offer / LOI',
  'Negotiating',
  'Under Contract',
  'Closed Won',
  'Archived',
]

export type TaskType =
  | 'Call'
  | 'Text'
  | 'Email'
  | 'Meeting'
  | 'Property Tour'
  | 'Send Listings'
  | 'Send CMA'
  | 'Send Letter'
export const TASK_TYPES: TaskType[] = [
  'Call',
  'Text',
  'Email',
  'Meeting',
  'Property Tour',
  'Send Listings',
  'Send CMA',
  'Send Letter',
]

export type ActivityKind =
  | 'call'
  | 'text'
  | 'visit'
  | 'meeting'
  | 'note'
  | 'stage-change'
  | 'task-completed'
  | 'created'

export type Lead = {
  id: string
  businessName: string
  ownerName: string
  jobTitleIndustry: string
  firm: string
  phone: string
  email: string
  industry: Industry
  city: string
  asset: string
  specialization: string
  metPersonally: string
  source: Source
  websiteStatus: WebsiteStatus
  connectionRating: ConnectionRating
  lastConversationNotes: string
  notes: string
  kind: LeadKind
  ageRange?: AgeRange
  letterCadenceDays?: number
  lastContactedAt: string | null
  createdAt: string
}

export type Deal = {
  id: string
  leadId: string
  stage: PipelineStage
  value: number
  expectedCloseDate: string
  probability: number
  createdAt: string
  updatedAt: string
}

export type Task = {
  id: string
  leadId: string
  type: TaskType
  dueAt: string
  completed: boolean
  completedAt: string | null
  notes: string
}

export type Activity = {
  id: string
  leadId: string
  kind: ActivityKind
  body: string
  timestamp: string
}

export type Settings = {
  theme: 'light' | 'dark'
  defaultRetailLetterCadenceDays: number
  defaultOpportunityOutreachMessage: string
}

export const DEFAULT_OPPORTUNITY_OUTREACH_MESSAGE =
  "Hi, it was great meeting you. You mentioned you were thinking about buying a home — I'd love to sit down and chat to see how I can help you on that journey. When would be a good time to connect?"

export type CrmState = {
  leads: Lead[]
  deals: Deal[]
  tasks: Task[]
  activities: Activity[]
  settings: Settings
}

export const EMPTY_STATE: CrmState = {
  leads: [],
  deals: [],
  tasks: [],
  activities: [],
  settings: {
    theme: 'light',
    defaultRetailLetterCadenceDays: 90,
    defaultOpportunityOutreachMessage: DEFAULT_OPPORTUNITY_OUTREACH_MESSAGE,
  },
}
