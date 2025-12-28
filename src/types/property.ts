export type PropertyStatus = 'J' | 'A' | 'P';

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
  exemptions?: string[];
  jurisdictions?: string[];
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  lastFollowUp?: string;
  notes?: string;
  phoneNumbers?: string[];
  ownerPhoneIndex?: number; // Index of which phone number is the owner's (0-5)
  // Task/Action fields
  actionType?: 'call' | 'text' | 'mail' | 'driveby';
  priority?: 'high' | 'med' | 'low';
  dueTime?: string; // ISO datetime string
  attempts?: number; // Number of contact attempts
  lastOutcome?: 'no_answer' | 'voicemail' | 'text_sent' | 'spoke_owner' | 'wrong_number' | 'not_interested' | 'new_owner' | 'call_back_later';
  lastOutcomeDate?: string;
  snoozedUntil?: string;
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
  
  // Operator-Entered (manual only)
  internal_status: PreForeclosureStatus;
  notes?: string;
  last_action_date?: string; // ISO date string
  next_follow_up_date?: string; // ISO date string
  
  // System-tracked (not user-editable)
  inactive: boolean; // true if record missing from latest upload
  first_seen_month: string; // System-tracked
  last_seen_month: string; // System-tracked
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

// Type aliases for convenience
export type PreForeclosure = PreForeclosureRecord;
export type PreForeclosureInternalStatus = PreForeclosureStatus;
