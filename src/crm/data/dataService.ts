import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import {
  INDUSTRIES,
  PIPELINE_STAGES,
  SOURCES,
  TASK_TYPES,
  WEBSITE_STATUSES,
  type ConnectionRating,
  type CrmState,
  type Industry,
  type PipelineStage,
  type Source,
  type TaskType,
  type WebsiteStatus,
} from './types';
import { ratingFromMetPersonally } from '../lib/connectionRating';
import { removeLegacyFakeFollowUps } from '../lib/tasks';

const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && options.includes(value as T);

const normalizeIndustry = (value: unknown): Industry =>
  isOneOf(value, INDUSTRIES) ? value : 'Other';

const normalizeSource = (value: unknown): Source => {
  if (isOneOf(value, SOURCES)) return value;
  const legacy: Record<string, Source> = {
    'Cold Call': 'Cold Outreach',
    SMS: 'Cold Outreach',
    'Walk-in': 'Networking',
    Scraped: 'Database',
  };
  return typeof value === 'string' && value in legacy ? legacy[value] : 'Referral';
};

const normalizePriority = (value: unknown): WebsiteStatus => {
  if (isOneOf(value, WEBSITE_STATUSES)) return value;
  const legacy: Record<string, WebsiteStatus> = {
    'No Website': 'This Week',
    'Bad Website': 'This Month',
    'Good Website': 'Nurture',
  };
  return typeof value === 'string' && value in legacy ? legacy[value] : 'This Month';
};

const normalizeStage = (value: unknown): PipelineStage => {
  if (isOneOf(value, PIPELINE_STAGES)) return value;
  const legacy: Record<string, PipelineStage> = {
    'New Lead': 'New Prospect',
    Contacted: 'Qualified',
    Interested: 'Property Search',
    'Demo Scheduled': 'Touring',
    'Proposal Sent': 'Offer / LOI',
    'Closed Lost': 'Archived',
  };
  return typeof value === 'string' && value in legacy ? legacy[value] : 'New Prospect';
};

const normalizeTaskType = (value: unknown): TaskType => {
  if (isOneOf(value, TASK_TYPES)) return value;
  const legacy: Record<string, TaskType> = {
    Visit: 'Meeting',
    'Send Proposal': 'Send CMA',
  };
  return typeof value === 'string' && value in legacy ? legacy[value] : 'Call';
};

const normalizeRating = (value: unknown): ConnectionRating => {
  if (value === 'great' || value === 'workable' || value === 'low-effort') return value;
  return 'none';
};

const normalizeState = (state: CrmState): CrmState => ({
  leads: state.leads.map((lead) => ({
    ...lead,
    jobTitleIndustry: lead.jobTitleIndustry ?? '',
    firm: lead.firm ?? lead.businessName ?? '',
    industry: normalizeIndustry(lead.industry),
    asset: lead.asset ?? '',
    specialization: lead.specialization ?? '',
    metPersonally: lead.metPersonally ?? '',
    source: normalizeSource(lead.source),
    websiteStatus: normalizePriority(lead.websiteStatus),
    connectionRating:
      normalizeRating(lead.connectionRating) === 'none'
        ? ratingFromMetPersonally(lead.metPersonally ?? '')
        : normalizeRating(lead.connectionRating),
    lastConversationNotes: lead.lastConversationNotes ?? '',
    notes: lead.notes ?? '',
  })),
  deals: state.deals.map((deal) => ({
    ...deal,
    stage: normalizeStage(deal.stage),
  })),
  tasks: removeLegacyFakeFollowUps(
    state.tasks.map((task) => ({
      ...task,
      type: normalizeTaskType(task.type),
    })),
  ),
  activities: state.activities,
  settings: {
    theme: state.settings?.theme ?? 'dark',
    defaultRetailLetterCadenceDays: state.settings?.defaultRetailLetterCadenceDays ?? 90,
    defaultOpportunityOutreachMessage:
      state.settings?.defaultOpportunityOutreachMessage ??
      "Hi, it was great meeting you. You mentioned you were thinking about buying — I'd love to sit down and chat to see how I can help. When would be a good time to connect?",
  },
});

export const dataService = {
  async load(): Promise<CrmState | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/state`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return normalizeState(data as CrmState);
    } catch {
      return null;
    }
  },

  save(state: CrmState): void {
    fetch(`${API_BASE_URL}/api/crm/state`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state),
    }).catch((err) => console.error('[CRM] sync error:', err));
  },

  clear(): void {
    // no-op — data lives in PostgreSQL
  },
};
