export type PropertyStatus = 'J' | 'A' | 'P' | 'F' | 'D';
// J = Judgment, A = Active, P = Pending, F = Foreclosed, D = Dead Lead

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
  paymentHistory?: PaymentRecord[];
  cadData?: CADData;
  isNew?: boolean;
  isRemoved?: boolean;
  statusChanged?: boolean;
  percentageChanged?: boolean;
  // Foreclosure-specific fields
  foreclosureSaleDate?: string;
  foreclosureDocumentNumber?: string;
  foreclosureLink?: string;
  // Dead Lead-specific fields
  resolutionDate?: string;
  resolutionReason?: string; // "Paid in full", "Sold to new owner", etc.
  resolutionNotes?: string;
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
    foreclosed: number;
    deadLeads: number;
  };
  totalAmountDue: number;
  avgAmountDue: number;
  newThisMonth: number;
  removedThisMonth: number;
  foreclosedCount: number;
  deadLeadsCount: number;
}

export interface ProcessingStatus {
  isProcessing: boolean;
  currentProperty?: string;
  processedCount: number;
  totalCount: number;
  startedAt?: string;
  estimatedCompletion?: string;
}
