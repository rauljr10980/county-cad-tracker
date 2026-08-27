import { toast } from 'sonner';
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

// The server always responds with `{ error: "..." }` on a handled failure
// (both 409 guards, and the generic 500). Fall back to a generic message when
// the body isn't JSON (e.g. a network proxy error page) so callers never show
// a bare status code.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  } catch {
    // response wasn't JSON — use the fallback below
  }
  return fallback;
}

// A load can fail for two very different reasons: the request itself failed
// (network error, non-2xx), or it succeeded and the account genuinely has no
// data yet. Callers must not conflate the two — a failed load must never be
// treated as "empty" (see dataService.load doc below).
export type LoadResult = { ok: true; state: CrmState } | { ok: false; error: string };

export const dataService = {
  async load(): Promise<LoadResult> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/state`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const error = await readErrorMessage(
          res,
          'Could not load your CRM data from the server. Please try again.',
        );
        return { ok: false, error };
      }
      const data = await res.json();
      return { ok: true, state: normalizeState(data as CrmState) };
    } catch {
      return {
        ok: false,
        error: 'Could not reach the server to load your CRM data. Check your connection and try again.',
      };
    }
  },

  save(state: CrmState): void {
    fetch(`${API_BASE_URL}/api/crm/state`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(state),
    })
      .then(async (res) => {
        if (!res.ok) {
          const message = await readErrorMessage(
            res,
            'Your CRM changes were not saved. Please try again.',
          );
          console.error('[CRM] save rejected:', message);
          toast.error(message);
        }
      })
      .catch((err) => {
        console.error('[CRM] sync error:', err);
        toast.error('Could not reach the server to save your CRM changes. Check your connection and try again.');
      });
  },

  clear(): void {
    // no-op — data lives in PostgreSQL
  },
};
