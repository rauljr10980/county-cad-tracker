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
  // Pipeline metrics
  pipeline?: {
    totalValue: number;
    activeDeals: number;
    byStage: {
      new_lead: number;
      contacted: number;
      interested: number;
      offer_sent: number;
      negotiating: number;
      under_contract: number;
      closed: number;
      dead: number;
    };
    conversionRate: number;
    avgDealValue: number;
  };
  // Task/Action metrics
  tasks?: {
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
  
  // Operator-Entered (manual only)
  internal_status: PreForeclosureStatus;
  notes?: string;
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
}
