export type PropertyStatus = 'J' | 'A' | 'P' | 'JUDGMENT' | 'ACTIVE' | 'PENDING' | 'PAID' | 'REMOVED' | 'UNKNOWN';

export interface Property {
  id: string;
  accountNumber: string;
  ownerName: string;
  propertyAddress: string;
  mailingAddress: string;
  status: PropertyStatus;
  previousStatus?: PropertyStatus;
  totalAmountDue: number;
  totalPercentage: number;
  legalDescription?: string;
  marketValue?: number;
  landValue?: number;
  improvementValue?: number;
  cappedValue?: number;
  agriculturalValue?: number; // NEW-Agricultural Value
  exemptions?: string[];
  jurisdictions?: string[];
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastPayer?: string; // NEW-Last Payer
  delinquentAfter?: string; // NEW-Delinquent After
  halfPaymentOptionAmount?: number; // NEW-Half Payment Option Amount
  priorYearsAmountDue?: number; // NEW-Prior Years Amount Due
  taxYear?: string; // NEW-Tax Year
  yearAmountDue?: number; // NEW-Year Amount Due
  yearTaxLevy?: number; // NEW-Year Tax Levy
  link?: string; // NEW-Link (URL to property detail page)
  ownerAddress?: string; // NEW-Owner Address (separate from mailingAddress)
  latitude?: number;
  longitude?: number;
  lastFollowUp?: string;
  notes?: string;
  phoneNumbers?: string[];
  ownerPhoneIndex?: number; // Index of which phone number is the owner's (0-5)
  // Task/Action fields
  taskId?: string; // Task ID for deletion
  actionType?: 'call' | 'text' | 'mail' | 'driveby';
  priority?: 'high' | 'med' | 'low';
  dueTime?: string; // ISO datetime string
  assignedTo?: 'Luciano' | 'Raul'; // Task assignment
  attempts?: number; // Number of contact attempts
  lastOutcome?: 'no_answer' | 'voicemail' | 'text_sent' | 'spoke_owner' | 'wrong_number' | 'not_interested' | 'new_owner' | 'call_back_later';
  lastOutcomeDate?: string;
  snoozedUntil?: string;
  // Pipeline/Deal fields
  dealStage?: 'new_lead' | 'contacted' | 'interested' | 'offer_sent' | 'negotiating' | 'under_contract' | 'closed' | 'dead';
  estimatedDealValue?: number;
  offerAmount?: number;
  expectedCloseDate?: string;
  paymentHistory?: PaymentRecord[];
  cadData?: CADData;
  isNew?: boolean;
  isRemoved?: boolean;
  statusChanged?: boolean;
  percentageChanged?: boolean;
  // Property type: true if ownerName appears in propertyAddress (same property)
  isPrimaryProperty?: boolean;
  // Visited Status
  visited?: boolean;
  visitedAt?: string;
  visitedBy?: string;
  // Workflow decision tree (same system as pre-foreclosure)
  workflow_stage?: WorkflowStage;
  workflow_log?: WorkflowLogEntry[];
}

export interface PaymentRecord {
  date: string;
  amount: number;
  description?: string;
}

export interface CADData {
  fetchedAt: string;
  address: string;
  legalDescription: string;
  totalAmountDue: number;
  marketValue: number;
  landValue: number;
  improvementValue: number;
  exemptions: string[];
  paymentHistory: PaymentRecord[];
}

export interface UploadedFile {
  id: string;
  filename: string;
  uploadedAt: string;
  processedAt?: string;
  propertyCount: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  processingStep?: string;
  processingMessage?: string;
  processingProgress?: number;
  processingUpdatedAt?: string;
}

export interface ComparisonReport {
  currentFile: string;
  previousFile: string;
  generatedAt: string;
  summary: {
    totalCurrent: number;
    totalPrevious: number;
    newProperties: number;
    removedProperties: number;
    statusChanges: number;
    percentageChanges: number;
  };
  statusTransitions: StatusTransition[];
  newProperties: Property[];
  removedProperties: Property[];
  changedProperties: Property[];
}

export interface StatusTransition {
  from: PropertyStatus;
  to: PropertyStatus;
  count: number;
  properties: Property[];
}

export interface DashboardStats {
  totalProperties: number;
  byStatus: {
    judgment: number;
    active: number;
    pending: number;
  };
  totalAmountDue: number;
  avgAmountDue: number;
  newThisMonth: number;
  removedThisMonth: number;
  deadLeads: number;
  amountDueDistribution?: { range: string; count: number; color: string }[];
  pipeline?: {
    totalValue: number;
    activeDeals: number;
    byStage: Record<string, number>;
    conversionRate: number;
    avgDealValue: number;
  };
  tasks?: {
    total: number;
    luciano: number;
    raul: number;
    callsDueToday: number;
    followUpsThisWeek: number;
    textsScheduled: number;
    mailCampaignActive: number;
    drivebyPlanned: number;
  };
}

export interface ProcessingStatus {
  isProcessing: boolean;
  currentProperty?: string;
  processedCount: number;
  totalCount: number;
  startedAt?: string;
  estimatedCompletion?: string;
}

// Pre-Foreclosure Data Model (Strict - No Enrichment)
export type PreForeclosureType = 'Mortgage' | 'Tax';
export type PreForeclosureStatus = 'New' | 'Contact Attempted' | 'Monitoring' | 'Dead';

// Workflow Decision Tree
export type WorkflowStage =
  | 'not_started'
  | 'initial_visit'
  | 'people_search'
  | 'call_owner'
  | 'land_records'
  | 'visit_heirs'
  | 'call_heirs'
  | 'negotiating'
  | 'dead_end';

export interface WorkflowLogEntry {
  id: string;
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  outcome: string;
  note?: string;
  actingAs?: 'Luciano' | 'Raul';
  timestamp: string;
}

// Auto-task mapping: when entering a stage, auto-create this task
export const STAGE_TASK_MAP: Record<WorkflowStage, { actionType: 'call' | 'driveby'; priority: 'high' | 'med' } | null> = {
  not_started: null,
  initial_visit: { actionType: 'driveby', priority: 'high' },
  people_search: { actionType: 'call', priority: 'med' },
  call_owner: { actionType: 'call', priority: 'high' },
  land_records: { actionType: 'driveby', priority: 'med' },
  visit_heirs: { actionType: 'driveby', priority: 'high' },
  call_heirs: { actionType: 'call', priority: 'high' },
  negotiating: { actionType: 'call', priority: 'high' },
  dead_end: null,
};

export const WORKFLOW_STAGES: Record<WorkflowStage, {
  label: string;
  shortLabel: string;
  question?: string;
  outcomes?: Array<{ label: string; nextStage: WorkflowStage }>;
  terminal?: boolean;
  terminalType?: 'success' | 'failure';
}> = {
  not_started: {
    label: 'Not Started',
    shortLabel: 'Not Started',
    outcomes: [{ label: 'Begin Workflow', nextStage: 'initial_visit' }],
  },
  initial_visit: {
    label: 'Initial Visit',
    shortLabel: 'Visit',
    question: 'Did the owner answer the door?',
    outcomes: [
      { label: 'Yes - Owner answered', nextStage: 'negotiating' },
      { label: 'No - Not home', nextStage: 'people_search' },
    ],
  },
  people_search: {
    label: 'People Search',
    shortLabel: 'Search',
    question: 'Found a valid phone number?',
    outcomes: [
      { label: 'Yes - Found number', nextStage: 'call_owner' },
      { label: 'No - Nothing found', nextStage: 'land_records' },
    ],
  },
  call_owner: {
    label: 'Call Owner',
    shortLabel: 'Call',
    question: 'Reached the owner?',
    outcomes: [
      { label: 'Yes - Reached owner', nextStage: 'negotiating' },
      { label: "Can't reach", nextStage: 'land_records' },
    ],
  },
  land_records: {
    label: 'Land Records / Due Diligence',
    shortLabel: 'Records',
    question: 'Found heirs?',
    outcomes: [
      { label: 'Yes - Found heirs', nextStage: 'visit_heirs' },
      { label: 'No heirs found', nextStage: 'dead_end' },
    ],
  },
  visit_heirs: {
    label: 'Visit Heirs',
    shortLabel: 'Visit Heirs',
    question: 'Did heirs answer the door?',
    outcomes: [
      { label: 'Yes - Heirs answered', nextStage: 'negotiating' },
      { label: 'No - Not home', nextStage: 'call_heirs' },
    ],
  },
  call_heirs: {
    label: 'Call Heirs',
    shortLabel: 'Call Heirs',
    question: 'Reached heirs?',
    outcomes: [
      { label: 'Yes - Reached heirs', nextStage: 'negotiating' },
      { label: "Can't reach", nextStage: 'dead_end' },
    ],
  },
  negotiating: {
    label: 'Negotiating',
    shortLabel: 'Negotiating',
    terminal: true,
    terminalType: 'success',
  },
  dead_end: {
    label: 'Dead End',
    shortLabel: 'Dead End',
    terminal: true,
    terminalType: 'failure',
  },
};

export interface PreForeclosureRecord {
  // Immutable (from file)
  document_number: string; // Primary key
  type: PreForeclosureType;
  address: string;
  city: string;
  zip: string;
  filing_month: string; // e.g., "January 2026"
  county: string; // e.g., "Bexar"
  latitude?: number;
  longitude?: number;
  school_district?: string;
  recorded_date?: string; // ISO date string
  sale_date?: string; // ISO date string

  // Operator-Entered (manual only)
  internal_status: PreForeclosureStatus;
  notes?: string;
  phoneNumbers?: string[]; // Array of up to 6 phone numbers
  ownerPhoneIndex?: number; // Index of which phone number is the owner's (0-5)
  last_action_date?: string; // ISO date string
  next_follow_up_date?: string; // ISO date string
  
  // Task/Action fields
  actionType?: 'call' | 'text' | 'mail' | 'driveby';
  priority?: 'high' | 'med' | 'low';
  dueTime?: string; // ISO datetime string
  assignedTo?: 'Luciano' | 'Raul';
  
  // System-tracked (not user-editable)
  inactive: boolean; // true if record missing from latest upload
  first_seen_month: string; // System-tracked
  last_seen_month: string; // System-tracked
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  
  // Visit tracking
  visited?: boolean;
  visited_at?: string; // ISO date string
  visited_by?: 'Luciano' | 'Raul';

  // Address matching / returning records
  is_returning?: boolean;
  previous_document_numbers?: string[];

  // Workflow decision tree
  workflow_stage?: WorkflowStage;
  workflow_log?: WorkflowLogEntry[];
}

// Type alias for backward compatibility
export type PreForeclosure = PreForeclosureRecord;
export type PreForeclosureInternalStatus = PreForeclosureStatus;