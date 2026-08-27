import type { Stage } from '../constants';
import type { NormalizedContacts } from '@/lib/contactsModel';

export type Assignee = { id: string; username: string };

// The persisted shape is the same unvalidated JSON blob `contactsModel.ts`
// normalises for the other landlord profile (`EvictionLeadsView`) — see that
// module's header comment. Sharing the type here keeps both readers honest
// about what a raw `contacts` column can actually contain.
export type Phone = NormalizedContacts['phoneRows'][number]['phones'][number];
export type Contacts = Partial<NormalizedContacts>;

export type Lead = {
  id: string;
  name: string;
  isCorporate: boolean;
  contactStage: Stage | string;
  serviceInterests: string[];
  contacts: Contacts;
  notes: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  parkedAt?: string | null;
  assignedToId?: string | null;
  assignedTo?: Assignee | null;
  filingCount: number;
  addressCount: number;
  latestFilingDate?: string;
  nextTask?: { dueAt: string } | null;
};

/**
 * What `PATCH /landlords/:id` actually returns: a bare `prisma.evictionLandlord.update(...)`
 * with no `include`, so none of the joined/derived fields are present. `patchLead` is typed
 * to this — not `Lead` or `LeadDetail` — so reading `.filings`, `.filingCount`, etc. off its
 * result is a type error instead of a runtime crash.
 */
export type LeadRow = Omit<Lead, 'filingCount' | 'addressCount' | 'latestFilingDate' | 'nextTask'>;

export type LeadDetail = Lead & {
  addresses: { id: string; address: string; city: string; state: string; zip: string }[];
  filings: {
    id: string; caseNumber: string; filedDate?: string; caseStatus: string;
    precinct: string; disposition: string; dispositionDate?: string; plaintiffAddress: string;
  }[];
  activities: { id: string; kind: string; body: string; createdAt: string }[];
  tasks: { id: string; type: string; dueAt: string; completed: boolean; notes: string }[];
};

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  address: string;
  landlordId: string;
  landlordName: string;
  contactStage: Stage | string;
  isCorporate: boolean;
};

export type GeocodeStatus = {
  total: number;
  pending: number;
  ok: number;
  failed: number;
  complete: boolean;
};

export type CrmStats = {
  total: number;
  byStage: Record<string, number>;
  byService: Record<string, number>;
  byAssignee: { userId: string; username: string; count: number }[];
  unassigned: number;
  followUpsDue: { overdue: number; today: number; next7: number };
  activeOpportunities: number;
  closedDeals: number;
};

export type LeadListResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export type ListLeadsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  stage?: string;
  service?: string;
  corporate?: 'true' | 'false' | 'all';
  assignedTo?: string;
  queue?: string;
};

export type PipelineCounts = {
  all: number;
  needsContact: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  parked: number;
  closed: number;
};
