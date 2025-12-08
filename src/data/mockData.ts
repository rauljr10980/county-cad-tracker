import { Property, UploadedFile, DashboardStats, ComparisonReport, ProcessingStatus, StatusTransition } from '@/types/property';

export const generateMockProperties = (count: number = 100): Property[] => {
  const statuses: ('J' | 'A' | 'P' | 'F' | 'D')[] = ['J', 'A', 'P', 'F', 'D'];
  const streets = ['Main St', 'Oak Ave', 'Cedar Ln', 'Pine Rd', 'Elm Dr', 'Maple Way', 'Birch Ct', 'Walnut Blvd'];
  const cities = ['San Antonio', 'Helotes', 'Leon Valley', 'Alamo Heights', 'Castle Hills'];
  const resolutionReasons = ['Paid in full', 'Sold to new owner', 'Payment plan completed', 'Tax exemption granted'];

  return Array.from({ length: count }, (_, i) => {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const previousStatus = Math.random() > 0.85 ? statuses[Math.floor(Math.random() * statuses.length)] : undefined;
    const isNew = Math.random() > 0.92;
    const isRemoved = Math.random() > 0.95;
    
    return {
      id: `prop-${i + 1}`,
      accountNumber: `${Math.floor(100000 + Math.random() * 900000)}`,
      ownerName: `Owner ${i + 1}`,
      propertyAddress: `${Math.floor(100 + Math.random() * 9900)} ${streets[Math.floor(Math.random() * streets.length)]}, ${cities[Math.floor(Math.random() * cities.length)]}, TX 78${Math.floor(200 + Math.random() * 100)}`,
      mailingAddress: `PO Box ${Math.floor(1000 + Math.random() * 9000)}, San Antonio, TX 78201`,
      status,
      previousStatus: previousStatus !== status ? previousStatus : undefined,
      totalAmountDue: Math.floor(1000 + Math.random() * 50000),
      totalPercentage: Math.floor(Math.random() * 100),
      legalDescription: `LOT ${Math.floor(1 + Math.random() * 50)} BLK ${Math.floor(1 + Math.random() * 20)} SUBDIVISION ${Math.floor(1 + Math.random() * 100)}`,
      marketValue: Math.floor(50000 + Math.random() * 500000),
      landValue: Math.floor(10000 + Math.random() * 100000),
      improvementValue: Math.floor(40000 + Math.random() * 400000),
      lastPaymentDate: `2024-${String(Math.floor(1 + Math.random() * 12)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}`,
      lastPaymentAmount: Math.floor(500 + Math.random() * 5000),
      lastFollowUp: Math.random() > 0.5 ? `2024-${String(Math.floor(1 + Math.random() * 12)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}` : undefined,
      isNew,
      isRemoved,
      statusChanged: previousStatus !== undefined && previousStatus !== status,
      percentageChanged: Math.random() > 0.9,
      // Foreclosure-specific fields
      foreclosureSaleDate: status === 'F' ? `2025-${String(Math.floor(1 + Math.random() * 6)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}` : undefined,
      foreclosureDocumentNumber: status === 'F' ? `FC-2024-${Math.floor(10000 + Math.random() * 90000)}` : undefined,
      foreclosureLink: status === 'F' ? `https://bexar.org/foreclosure/details/${Math.floor(10000 + Math.random() * 90000)}` : undefined,
      // Dead Lead-specific fields
      resolutionDate: status === 'D' ? `2024-${String(Math.floor(10 + Math.random() * 3)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}` : undefined,
      resolutionReason: status === 'D' ? resolutionReasons[Math.floor(Math.random() * resolutionReasons.length)] : undefined,
      resolutionNotes: status === 'D' ? `Property resolved via ${resolutionReasons[Math.floor(Math.random() * resolutionReasons.length)].toLowerCase()}` : undefined,
      paymentHistory: Array.from({ length: Math.floor(3 + Math.random() * 10) }, (_, j) => ({
        date: `202${3 - Math.floor(j / 4)}-${String(12 - (j % 12)).padStart(2, '0')}-15`,
        amount: Math.floor(200 + Math.random() * 2000),
        description: 'Tax Payment',
      })),
    };
  });
};

export const mockProperties = generateMockProperties(500);

export const mockFiles: UploadedFile[] = [
  {
    id: 'file-1',
    filename: 'bexar_tax_delinquent_dec_2024.xlsx',
    uploadedAt: '2024-12-01T10:30:00Z',
    processedAt: '2024-12-01T10:45:00Z',
    propertyCount: 58432,
    status: 'completed',
  },
  {
    id: 'file-2',
    filename: 'bexar_tax_delinquent_nov_2024.xlsx',
    uploadedAt: '2024-11-01T09:15:00Z',
    processedAt: '2024-11-01T09:30:00Z',
    propertyCount: 57891,
    status: 'completed',
  },
  {
    id: 'file-3',
    filename: 'bexar_tax_delinquent_oct_2024.xlsx',
    uploadedAt: '2024-10-01T11:00:00Z',
    processedAt: '2024-10-01T11:20:00Z',
    propertyCount: 57234,
    status: 'completed',
  },
];

export const mockDashboardStats: DashboardStats = {
  totalProperties: 58432,
  byStatus: {
    judgment: 12456,
    active: 28943,
    pending: 17033,
    foreclosed: 1543,
    deadLeads: 702,
  },
  totalAmountDue: 847293847,
  avgAmountDue: 14500,
  newThisMonth: 1243,
  removedThisMonth: 702,
  foreclosedCount: 1543,
  deadLeadsCount: 702,
};

export const mockStatusTransitions: StatusTransition[] = [
  { from: 'P', to: 'A', count: 342, properties: mockProperties.slice(0, 5) },
  { from: 'A', to: 'J', count: 156, properties: mockProperties.slice(5, 10) },
  { from: 'P', to: 'J', count: 89, properties: mockProperties.slice(10, 15) },
  { from: 'J', to: 'A', count: 23, properties: mockProperties.slice(15, 18) },
  { from: 'A', to: 'P', count: 12, properties: mockProperties.slice(18, 20) },
];

export const mockComparisonReport: ComparisonReport = {
  currentFile: 'bexar_tax_delinquent_dec_2024.xlsx',
  previousFile: 'bexar_tax_delinquent_nov_2024.xlsx',
  generatedAt: '2024-12-01T10:45:00Z',
  summary: {
    totalCurrent: 58432,
    totalPrevious: 57891,
    newProperties: 1243,
    removedProperties: 702,
    statusChanges: 622,
    percentageChanges: 3421,
  },
  statusTransitions: mockStatusTransitions,
  newProperties: mockProperties.filter(p => p.isNew).slice(0, 20),
  removedProperties: mockProperties.filter(p => p.isRemoved).slice(0, 10),
  changedProperties: mockProperties.filter(p => p.statusChanged).slice(0, 30),
};

export const mockProcessingStatus: ProcessingStatus = {
  isProcessing: false,
  processedCount: 0,
  totalCount: 0,
};
