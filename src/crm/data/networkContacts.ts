import type {
  Activity,
  ConnectionRating,
  CrmState,
  Deal,
  Industry,
  Lead,
  PipelineStage,
  Source,
  Task,
  TaskType,
  WebsiteStatus,
} from './types'
import { ratingFromMetPersonally } from '../lib/connectionRating'

export type NetworkContactRecord = {
  category: string
  name: string
  city: string
  company: string
  email: string
  phone: string
  asset: string
  specialization: string
  notes: string
  metPersonally: string
}

export const NETWORK_IMPORT_VERSION = 're-network-2026-05-07'

const NETWORK_CONTACTS: NetworkContactRecord[] = [
  { category: 'Brokers', name: 'Larry Mendez', city: 'San Antonio', company: 'CBRE', email: '', phone: '', asset: 'Office', specialization: 'Tenant Rep', notes: '', metPersonally: '' },
  { category: 'Brokers', name: 'Ernest Brown', city: 'San Antonio', company: 'NAI', email: '', phone: '', asset: 'Retail', specialization: 'Invesment Sales', notes: '', metPersonally: '' },
  { category: 'Brokers', name: 'Derek Rosson', city: 'San Antonio', company: 'Rosson Capital', email: 'Derek@RossonCapital.com', phone: '210-550-8002', asset: 'N/A', specialization: 'Private Equity', notes: 'Need to text him about coffee', metPersonally: '' },
  { category: 'Brokers', name: 'Scott', city: 'San Antonio', company: 'CBRE', email: '', phone: '', asset: 'Medical Office', specialization: 'Invesment Sales', notes: 'Pending Coffee', metPersonally: '' },
  { category: 'Brokers', name: 'Amber Austin', city: 'San Antonio', company: 'CBRE', email: '', phone: '', asset: 'Office', specialization: 'Landlord/tenant rep', notes: 'Met at ULI, work with Jenny', metPersonally: '' },
  { category: 'Brokers', name: 'Jorge', city: 'San Antonio', company: 'NAI', email: '', phone: '210-366-1400', asset: 'International', specialization: 'Invesment Sales', notes: 'Met at CCIM, works with Ernest', metPersonally: '' },
  { category: 'Brokers', name: 'Chris Thompson', city: 'San Antonio', company: 'Transwestern', email: '', phone: '', asset: 'all', specialization: 'Tenant Rep', notes: 'never met', metPersonally: '' },
  { category: 'Brokers', name: 'David Ballard', city: 'San Antonio', company: 'CBRE', email: 'david.ballard1@cbre.com', phone: '210-841-3299', asset: 'Office', specialization: 'Tenant Rep', notes: 'Nice, willing to help, like steady income', metPersonally: '' },
  { category: 'Brokers', name: 'Raymond Kang', city: 'San Antonio', company: 'Marcus & Millichap', email: 'Ray.Kang@MarcusMillichap.com', phone: '512-400-5950', asset: 'Retail', specialization: 'Invesment Sales', notes: 'Met at CCIM Sympsosium', metPersonally: '' },
  { category: 'Brokers', name: 'Ryan Metz', city: 'San Antonio', company: 'CBRE', email: 'Ryan.metz@cbre.com', phone: '210-253-6080', asset: 'Office', specialization: 'Tenant Rep/Ballard team', notes: 'yobana gave me his card', metPersonally: '' },
  { category: 'Brokers', name: 'Christi Griggs', city: 'San Antonio', company: 'CBRE', email: 'Christi.griggs', phone: '210-912-4324', asset: 'Office', specialization: 'Invesment Sales', notes: 'used to be architect', metPersonally: '' },
  { category: 'Asset Managers', name: 'Benjamin Joyner', city: 'San Antonio', company: 'Affinius', email: '', phone: '', asset: 'all', specialization: '', notes: 'met at uli, cool', metPersonally: '' },
  { category: 'Asset Managers', name: 'Roman smichtd', city: 'San Antonio', company: 'Affinius', email: '', phone: '', asset: 'all', specialization: '', notes: 'met at uli, cool', metPersonally: '' },
  { category: 'Asset Managers', name: 'Jason Burkhart', city: 'San Antonio', company: 'Affinius', email: '', phone: '', asset: 'all', specialization: '', notes: 'cool', metPersonally: '' },
  { category: 'CEOS', name: 'Ed Cross', city: 'San Antonio', company: 'Retired', email: '', phone: '', asset: '', specialization: 'Developer', notes: 'Saw him at ULI mentorship/coffe', metPersonally: '' },
  { category: 'CEOS', name: 'Bill Shown', city: 'San Antonio', company: 'Oxbow', email: '', phone: '', asset: 'Mixed Use', specialization: 'Developer', notes: 'Law school - St Marys', metPersonally: '' },
  { category: 'CEOS', name: 'Thomas A. Corser', city: 'San Antonio', company: 'Arboretum SA', email: 'tcorser@arboretumsa.org', phone: '908-400-3300', asset: 'Trees', specialization: 'Trees', notes: 'met at ULI, bro in law of H. Cisneros', metPersonally: '' },
  { category: 'CEOS', name: 'Madison Smith', city: 'San Antonio', company: 'Overland Partnets', email: '', phone: '(210) 867-6329', asset: '', specialization: 'Architect', notes: 'Very religious, positive like me.', metPersonally: '' },
  { category: 'CEOS', name: 'David Adelman', city: 'San Antonio', company: 'Area Real estate', email: '', phone: '', asset: '', specialization: '', notes: 'Never Met', metPersonally: '' },
  { category: 'CEOS', name: 'David Morin', city: 'San Antonio/Austin', company: '', email: '', phone: '', asset: 'Multifamily', specialization: 'Developer', notes: 'have him on Linkedin', metPersonally: '' },
  { category: 'Developers', name: 'Omar Gonzales', city: 'San Antonio', company: 'Oxbow', email: '', phone: '', asset: 'Mixed Use', specialization: 'Director of Development', notes: '', metPersonally: '' },
  { category: 'Developers', name: 'Gene Williams', city: 'San Antonio', company: 'Private Equity, And also developer', email: '', phone: '', asset: '', specialization: '', notes: 'Met with Omar, gene was a broker', metPersonally: '' },
  { category: 'Developers', name: 'David Robinson Jr.', city: 'San Antonio', company: 'Weston Urban', email: 'david@westonurban.com', phone: '', asset: '', specialization: '', notes: '', metPersonally: '' },
  { category: 'Capital Markets', name: 'Whitney', city: 'San Antonio', company: 'JLL', email: '', phone: '', asset: 'Multifamily', specialization: 'Director?', notes: 'Works with Chris', metPersonally: '' },
  { category: 'Capital Markets', name: 'Chris Roper', city: 'San Antonio', company: 'EMBREY GUY', email: '', phone: '', asset: 'Multifamily', specialization: 'Analyst', notes: 'get coffee', metPersonally: '' },
  { category: 'Capital Markets', name: 'Rober Arzola', city: 'Austin', company: 'JLL', email: '', phone: '', asset: 'Multifamily', specialization: 'Director?', notes: 'get coffee', metPersonally: '' },
  { category: 'Investments', name: 'Justin Ventura', city: 'San Antonio', company: 'Partners', email: '', phone: '', asset: 'investment sales', specialization: 'Analyst', notes: 'cool', metPersonally: '' },
  { category: 'Investments', name: 'Daniel Pacora', city: 'San Antonio', company: 'REEP', email: '', phone: '', asset: 'Aquisitions', specialization: 'Analyst', notes: '', metPersonally: '' },
  { category: 'RE miscellanous', name: 'Valdrin Makolli', city: 'San Antonio', company: 'Stream Realty Partners', email: '', phone: '', asset: '', specialization: 'Associate', notes: 'Same ULI Mentor, Andi', metPersonally: '' },
  { category: 'Commercial Lending', name: 'Andrew Ozuna', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'My Mentor at Finance, Democrat', metPersonally: '' },
  { category: 'Commercial Lending', name: 'Antonio Moreno', city: 'San Antonio', company: 'RIO BANK', email: '', phone: '', asset: '', specialization: '', notes: 'Knows charly/laredo', metPersonally: '' },
  { category: 'Commercial Lending', name: 'Jaydyn perrin', city: 'Chicago', company: 'Wells fargo', email: '', phone: '', asset: '', specialization: '', notes: 'Wells Fargo summit/ chicago', metPersonally: '' },
  { category: 'Young Professionals', name: 'Adrian Arevalo', city: 'San Antonio', company: 'BFI', email: '', phone: '', asset: 'Mixed Use', specialization: 'Associate', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Bobby Pena', city: 'San Antonio', company: 'Equity solutions', email: '', phone: '', asset: 'Medical Office', specialization: 'Intern', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Vince Galvan', city: 'San Antonio', company: 'Mcwhinney', email: '', phone: '', asset: 'Mixed Use', specialization: 'Intern', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Yobana Castillo', city: 'San Antonio', company: 'CBRE', email: '', phone: '', asset: 'Office', specialization: 'Associate', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Hunter Pfeiffer', city: 'San Antonio', company: 'UTSA RE', email: '', phone: '', asset: 'Asset Manager', specialization: 'Asset Management analyst', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Sarah Kai', city: 'San Antonio', company: 'ULI/EMBREY', email: '', phone: '', asset: 'Young leaders', specialization: 'Leader', notes: 'Workerd with at Embrey', metPersonally: '' },
  { category: 'Young Professionals', name: 'Connor', city: 'San Antonio', company: 'JLL', email: '', phone: '', asset: 'RE Gov/Public', specialization: 'Analyst?', notes: 'from a&m', metPersonally: '' },
  { category: 'Young Professionals', name: 'Diego Gomez', city: 'San Antonio', company: 'student', email: '', phone: '', asset: 'Land Dev', specialization: 'Intern', notes: 'From Laredo', metPersonally: '' },
  { category: 'Young Professionals', name: 'Omar Pintor', city: 'San Antonio', company: 'student', email: '', phone: '', asset: '', specialization: '', notes: 'cool', metPersonally: '' },
  { category: 'Young Professionals', name: 'Ben Pawelek', city: 'San Antonio', company: 'IDK', email: '', phone: '', asset: 'Ranches', specialization: 'IDK', notes: 'Treasurer of RES', metPersonally: '' },
  { category: 'Young Professionals', name: 'Derek', city: 'San Antonio', company: 'student', email: '', phone: '', asset: 'Land Dev', specialization: 'Analyst', notes: 'cool', metPersonally: '' },
  { category: 'Young Professionals', name: 'Ariel Gaytan', city: 'San Antonio', company: 'student', email: '', phone: '', asset: '', specialization: '', notes: 'from the valley', metPersonally: '' },
  { category: 'Young Professionals', name: 'Jair Lugo', city: 'San Antonio', company: 'Student', email: '', phone: '', asset: 'Accounting', specialization: '', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Andrew Estrada', city: 'San Antonio', company: 'Student', email: '', phone: '', asset: '', specialization: '', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Devin Driskell', city: 'Austin', company: 'Student', email: '', phone: '', asset: '', specialization: '', notes: 'works in austin', metPersonally: '' },
  { category: 'Young Professionals', name: 'Russell Ogbor', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Officer RES', metPersonally: '' },
  { category: 'Young Professionals', name: 'Brian Velasquez', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: '', metPersonally: '' },
  { category: 'Young Professionals', name: 'Arnas', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Investment Society', metPersonally: '' },
  { category: 'Young Professionals', name: 'Sebastian Hastings', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Investment Society', metPersonally: '' },
  { category: 'Finance', name: 'Blake Hastings (Dad)', city: 'San Antonio', company: 'SWBC', email: 'blake.hastings@swbc.com', phone: '210-842-2913', asset: 'Insurance', specialization: 'Chief Economist', notes: 'hastings dad, cool', metPersonally: '' },
  { category: 'Finance', name: 'Sebastian Hastings (Son)', city: 'San Antonio', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'son of hastings, very cool, INV soc', metPersonally: '' },
  { category: 'Finance', name: 'Alonso Zaldivar', city: 'Charlotte, NC', company: 'Wells fargo', email: 'alonzo.zaldivar@wellsfargo.com', phone: '909-815-4773', asset: 'Inv Bank', specialization: 'Inv Bank', notes: 'Went to USC, he is hispanic', metPersonally: '' },
  { category: 'Finance', name: 'Sebastian Rodrigues', city: 'San Antonio', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'NVC, INV soc', metPersonally: '' },
  { category: 'Finance', name: 'Juan carlos gallegos', city: 'San Antonio', company: 'JPM', email: '', phone: '', asset: '', specialization: '', notes: 'Investment society', metPersonally: '' },
  { category: 'Finance', name: 'Juan carlos sanchez', city: 'San Antonio', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Investment society', metPersonally: '' },
  { category: 'Finance', name: 'Mariana Llanas', city: 'San Antonio', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Investment society', metPersonally: '' },
  { category: 'Finance', name: 'Santino Pascual', city: 'RGV', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Valley finance bro', metPersonally: '' },
  { category: 'Cyber Security', name: 'Randy Herrera', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'Wells fargo summit/Houston', metPersonally: '' },
  { category: 'Cyber Security', name: 'Ramiro', city: '', company: '', email: '', phone: '', asset: '', specialization: '', notes: 'from memorial', metPersonally: '' },
  { category: 'Architects', name: 'Chris Martinez', city: 'San Antonio', company: 'KW', email: '', phone: '', asset: 'Landscape Arch.', specialization: 'Marketing', notes: 'Met at ULI,', metPersonally: '' },
  { category: 'Architects', name: 'Ann Flores', city: 'San Antonio', company: 'Overland Partners', email: '', phone: '(210) 625-6495', asset: 'Asssitant to Madison', specialization: 'Assistant to CEO', notes: '', metPersonally: '' },
  { category: 'Relations', name: 'Steve Hudson', city: 'San Antonio', company: 'First American', email: '', phone: '', asset: '', specialization: 'title', notes: 'cool', metPersonally: '' },
]

const dayOffset = (now: Date, days: number): string => {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const networkLeadId = (record: NetworkContactRecord): string =>
  `network-${slug(`${record.category}-${record.name}-${record.company || record.city || 'contact'}`)}`

const textFor = (record: NetworkContactRecord): string =>
  `${record.category} ${record.company} ${record.asset} ${record.specialization} ${record.notes}`.toLowerCase()

const relationshipTypeFor = (record: NetworkContactRecord): Industry => {
  const text = textFor(record)
  if (text.includes('tenant rep')) return 'Tenant Rep'
  if (text.includes('landlord')) return 'Landlord Rep'
  if (text.includes('developer') || record.category === 'Developers' || record.category === 'CEOS') return 'Developer'
  if (
    text.includes('investment') ||
    text.includes('invesment') ||
    text.includes('capital') ||
    text.includes('private equity') ||
    record.category === 'Asset Managers' ||
    record.category === 'Investments'
  ) {
    return 'Investor'
  }
  if (
    record.category === 'Commercial Lending' ||
    record.category === 'Finance' ||
    record.category === 'Architects' ||
    record.category === 'Title'
  ) {
    return 'Referral Partner'
  }
  return 'Other'
}

const priorityFor = (record: NetworkContactRecord): WebsiteStatus => {
  const text = textFor(record)
  if (text.includes('need') || text.includes('pending') || text.includes('get coffee') || text.includes('text him')) {
    return 'This Week'
  }
  if (text.includes('never met') || text.includes('linkedin')) return 'Nurture'
  if (record.notes) return 'This Month'
  return 'Nurture'
}

const ratingFor = (record: NetworkContactRecord): ConnectionRating => {
  const explicitRating = ratingFromMetPersonally(record.metPersonally)
  if (explicitRating !== 'none') return explicitRating

  const text = textFor(record)
  if (text.includes('never met')) return 'none'
  if (text.includes('very cool') || text.includes('nice') || text.includes('willing to help') || text.includes('positive like me')) {
    return 'great'
  }
  if (text.includes('cool') || text.includes('met at') || text.includes('works with') || text.includes('knows') || text.includes('from ')) {
    return 'workable'
  }
  return 'none'
}

const sourceFor = (): Source => 'Database'

const taskTypeFor = (record: NetworkContactRecord): TaskType => {
  const text = textFor(record)
  if (text.includes('text')) return 'Text'
  if (text.includes('coffee')) return 'Meeting'
  return 'Call'
}

const metaNotesFor = (record: NetworkContactRecord): string =>
  [
    `Imported from RE network.xlsx`,
    `Category: ${record.category}`,
    record.asset ? `Asset: ${record.asset}` : '',
    record.specialization ? `Specialization: ${record.specialization}` : '',
    record.metPersonally ? `Met personally: ${record.metPersonally}` : '',
  ]
    .filter(Boolean)
    .join('\n')

const contactToLead = (record: NetworkContactRecord, now: Date, index: number): Lead => ({
  id: networkLeadId(record),
  businessName: record.company || record.name,
  ownerName: record.name,
  jobTitleIndustry: record.category,
  firm: record.company,
  phone: record.phone,
  email: record.email,
  industry: relationshipTypeFor(record),
  city: record.city,
  asset: record.asset,
  specialization: record.specialization,
  metPersonally: record.metPersonally,
  source: sourceFor(),
  websiteStatus: priorityFor(record),
  connectionRating: ratingFor(record),
  lastConversationNotes: record.notes,
  notes: metaNotesFor(record),
  kind: 'industry',
  lastContactedAt: record.notes && !record.notes.toLowerCase().includes('never met')
    ? dayOffset(now, -((index % 28) + 3))
    : null,
  createdAt: dayOffset(now, -(index + 1)),
})

type OpportunityDemo = { lead: Lead; deal: Deal }

const buildOpportunityDemos = (now: Date): OpportunityDemo[] => {
  const make = (
    suffix: string,
    name: string,
    firm: string,
    city: string,
    websiteStatus: WebsiteStatus,
    ageDays: number,
    stage: PipelineStage,
    value: number,
    probability: number,
  ): OpportunityDemo => {
    const createdAt = dayOffset(now, -ageDays)
    const lead: Lead = {
      id: `network-opp-${suffix}`,
      businessName: firm,
      ownerName: name,
      jobTitleIndustry: 'Brokers',
      firm,
      phone: '',
      email: '',
      industry: 'Other',
      city,
      asset: '',
      specialization: '',
      metPersonally: '',
      source: 'Referral',
      websiteStatus,
      connectionRating: 'none',
      lastConversationNotes: '',
      notes: 'Demo opportunity for the pipeline.',
      kind: 'industry',
      lastContactedAt: null,
      createdAt,
    }
    const deal: Deal = {
      id: `network-opp-deal-${suffix}`,
      leadId: lead.id,
      stage,
      value,
      expectedCloseDate: dayOffset(now, 30).slice(0, 10),
      probability,
      createdAt,
      updatedAt: createdAt,
    }
    return { lead, deal }
  }

  return [
    make('1', 'Tomas Ortega',  'Ortega Holdings', 'San Antonio', 'Immediate', 1,  'New Prospect',    90000,  20),
    make('2', 'Lupe Castillo', 'Castillo Group',  'Austin',      'This Week', 5,  'Qualified',       250000, 30),
    make('3', 'Marcus Reed',   'Reed Realty',     'Dallas',      'This Week', 12, 'Property Search', 425000, 50),
  ]
}

const needsFollowUpTask = (record: NetworkContactRecord): boolean => {
  const text = textFor(record)
  return text.includes('coffee') || text.includes('text') || text.includes('pending')
}

export const buildNetworkStateFromRecords = (
  records: NetworkContactRecord[],
  now: Date,
): CrmState => {
  const industryLeads = records.map((record, index) => contactToLead(record, now, index))
  const opportunityDemos = buildOpportunityDemos(now)
  const leads = [...industryLeads, ...opportunityDemos.map((entry) => entry.lead)]
  const deals: Deal[] = opportunityDemos.map((entry) => entry.deal)
  const activities: Activity[] = [
    ...industryLeads.map((lead, index) => ({
      id: `network-activity-${String(index + 1).padStart(4, '0')}`,
      leadId: lead.id,
      kind: 'created' as const,
      body: `Imported from RE network.xlsx`,
      timestamp: lead.createdAt,
    })),
    ...opportunityDemos.map((entry, index) => ({
      id: `network-opp-activity-${String(index + 1).padStart(4, '0')}`,
      leadId: entry.lead.id,
      kind: 'stage-change' as const,
      body: 'Moved contact into Opportunities',
      timestamp: entry.deal.createdAt,
    })),
  ]

  const tasks: Task[] = records.flatMap((record, index) => {
    if (!needsFollowUpTask(record)) return []
    const lead = industryLeads[index]
    return [{
      id: `network-task-${String(index + 1).padStart(4, '0')}`,
      leadId: lead.id,
      type: taskTypeFor(record),
      dueAt: dayOffset(now, (index % 5) + 1),
      completed: false,
      completedAt: null,
      notes: record.notes || `Follow up with ${record.name}`,
    }]
  })

  return {
    leads,
    deals,
    tasks,
    activities,
    settings: {
      theme: 'light',
      defaultRetailLetterCadenceDays: 90,
      defaultOpportunityOutreachMessage:
        "Hi, it was great meeting you. You mentioned you were thinking about buying a home — I'd love to sit down and chat to see how I can help you on that journey. When would be a good time to connect?",
    },
  }
}

export const buildNetworkState = (now: Date): CrmState =>
  buildNetworkStateFromRecords(NETWORK_CONTACTS, now)

const demoLeadIdPattern = /^lead-\d{4}$/
const networkLeadIdPattern = /^network-/

type ReplaceNetworkContactsOptions = {
  preserveLocalRelationshipState?: boolean
  preserveLocalNotes?: boolean
}

export const replaceNetworkContacts = (
  state: CrmState,
  records: NetworkContactRecord[],
  now: Date,
  options: ReplaceNetworkContactsOptions = {},
): CrmState => {
  const {
    preserveLocalRelationshipState = true,
    preserveLocalNotes = false,
  } = options
  const networkState = buildNetworkStateFromRecords(records, now)
  const existingById = new Map(state.leads.map((lead) => [lead.id, lead]))
  const demoIds = new Set(
    state.leads
      .filter((lead) => demoLeadIdPattern.test(lead.id) || networkLeadIdPattern.test(lead.id))
      .map((lead) => lead.id),
  )
  const networkLeads = networkState.leads.map((lead) => {
    const existing = existingById.get(lead.id)
    if (!existing) return lead

    const existingRating = existing.connectionRating ?? 'none'
    return {
      ...lead,
      connectionRating:
        preserveLocalRelationshipState && existingRating !== 'none'
          ? existingRating
          : lead.connectionRating,
      metPersonally:
        preserveLocalRelationshipState && existing.metPersonally
          ? existing.metPersonally
          : lead.metPersonally,
      lastContactedAt:
        preserveLocalRelationshipState && existing.lastContactedAt
          ? existing.lastContactedAt
          : lead.lastContactedAt,
      createdAt: existing.createdAt || lead.createdAt,
      lastConversationNotes:
        preserveLocalNotes && existing.lastConversationNotes
          ? existing.lastConversationNotes
          : lead.lastConversationNotes,
      notes:
        preserveLocalNotes && existing.notes
          ? existing.notes
          : lead.notes,
    }
  })

  return {
    ...state,
    leads: [
      ...state.leads.filter((lead) => !demoIds.has(lead.id)),
      ...networkLeads,
    ],
    deals: [
      ...state.deals.filter((deal) => !demoIds.has(deal.leadId)),
      ...networkState.deals,
    ],
    tasks: [
      ...state.tasks.filter((task) => !demoIds.has(task.leadId)),
      ...networkState.tasks,
    ],
    activities: [
      ...state.activities.filter((activity) => !demoIds.has(activity.leadId)),
      ...networkState.activities,
    ],
  }
}

export const mergeNetworkState = (state: CrmState, now: Date): CrmState =>
  replaceNetworkContacts(state, NETWORK_CONTACTS, now, {
    preserveLocalRelationshipState: true,
    preserveLocalNotes: true,
  })
