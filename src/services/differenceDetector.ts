/**
 * Difference Detector Service
 * Compares month-to-month property data to detect changes
 */

import { Property, PropertyStatus, ComparisonReport, StatusTransition } from '@/types/property';

export interface DifferenceResult {
  newProperties: Property[];
  removedProperties: Property[];
  changedProperties: Property[];
  statusTransitions: StatusTransition[];
  foreclosedProperties: Property[];
  deadLeadProperties: Property[];
}

/**
 * Compare two property datasets (current vs previous month)
 */
export function detectDifferences(
  currentProperties: Property[],
  previousProperties: Property[]
): DifferenceResult {
  // Create maps for quick lookup
  const currentMap = new Map(
    currentProperties.map(p => [p.accountNumber, p])
  );
  const previousMap = new Map(
    previousProperties.map(p => [p.accountNumber, p])
  );

  const newProperties: Property[] = [];
  const removedProperties: Property[] = [];
  const changedProperties: Property[] = [];
  const statusTransitions: Map<string, StatusTransition> = new Map();

  // Find new and changed properties
  for (const current of currentProperties) {
    const previous = previousMap.get(current.accountNumber);

    if (!previous) {
      // New property
      current.isNew = true;
      newProperties.push(current);
    } else {
      // Check for changes
      const hasStatusChange = current.status !== previous.status;
      const hasPercentageChange = Math.abs(current.totalPercentage - previous.totalPercentage) > 0.01;

      if (hasStatusChange || hasPercentageChange) {
        current.statusChanged = hasStatusChange;
        current.percentageChanged = hasPercentageChange;
        current.previousStatus = previous.status;
        changedProperties.push(current);

        // Track status transitions
        if (hasStatusChange) {
          const transitionKey = `${previous.status}-${current.status}`;
          const existing = statusTransitions.get(transitionKey);

          if (existing) {
            existing.count++;
            existing.properties.push(current);
          } else {
            statusTransitions.set(transitionKey, {
              from: previous.status,
              to: current.status,
              count: 1,
              properties: [current],
            });
          }
        }
      }
    }
  }

  // Find removed properties (potential dead leads)
  for (const previous of previousProperties) {
    if (!currentMap.has(previous.accountNumber)) {
      previous.isRemoved = true;
      removedProperties.push(previous);
    }
  }

  // Identify dead leads (removed but not foreclosed)
  const deadLeadProperties = identifyDeadLeads(removedProperties, currentProperties);

  // Identify foreclosed properties
  const foreclosedProperties = currentProperties.filter(p => p.status === 'F');

  return {
    newProperties,
    removedProperties,
    changedProperties,
    statusTransitions: Array.from(statusTransitions.values()),
    foreclosedProperties,
    deadLeadProperties,
  };
}

/**
 * Identify dead leads from removed properties
 * Dead leads are properties that were removed but are not foreclosed
 */
function identifyDeadLeads(
  removedProperties: Property[],
  currentProperties: Property[]
): Property[] {
  const foreclosedAccounts = new Set(
    currentProperties
      .filter(p => p.status === 'F')
      .map(p => p.accountNumber)
  );

  return removedProperties
    .filter(p => !foreclosedAccounts.has(p.accountNumber))
    .map(p => ({
      ...p,
      status: 'D' as PropertyStatus,
      resolutionDate: new Date().toISOString(),
      resolutionReason: 'Property no longer on delinquent list',
      resolutionNotes: 'Likely paid in full or sold to new owner',
    }));
}

/**
 * Generate a comparison report
 */
export function generateComparisonReport(
  currentFileName: string,
  previousFileName: string,
  currentProperties: Property[],
  previousProperties: Property[]
): ComparisonReport {
  const differences = detectDifferences(currentProperties, previousProperties);

  return {
    currentFile: currentFileName,
    previousFile: previousFileName,
    generatedAt: new Date().toISOString(),
    summary: {
      totalCurrent: currentProperties.length,
      totalPrevious: previousProperties.length,
      newProperties: differences.newProperties.length,
      removedProperties: differences.removedProperties.length,
      statusChanges: differences.changedProperties.filter(p => p.statusChanged).length,
      percentageChanges: differences.changedProperties.filter(p => p.percentageChanged).length,
    },
    statusTransitions: differences.statusTransitions,
    newProperties: differences.newProperties,
    removedProperties: differences.removedProperties,
    changedProperties: differences.changedProperties,
  };
}

/**
 * Match foreclosure data with existing properties
 */
export interface ForeclosureRecord {
  address?: string;
  documentNumber?: string;
  saleDate?: string;
  accountNumber?: string;
}

export function matchForeclosureData(
  properties: Property[],
  foreclosureRecords: ForeclosureRecord[]
): Property[] {
  const updatedProperties: Property[] = [];

  for (const property of properties) {
    let matched = false;

    for (const record of foreclosureRecords) {
      // Match by account number (preferred)
      if (record.accountNumber && property.accountNumber === record.accountNumber) {
        matched = true;
      }
      // Match by address
      else if (record.address && normalizeAddress(property.propertyAddress) === normalizeAddress(record.address)) {
        matched = true;
      }
      // Match by document number
      else if (record.documentNumber && property.foreclosureDocumentNumber === record.documentNumber) {
        matched = true;
      }

      if (matched) {
        updatedProperties.push({
          ...property,
          status: 'F',
          foreclosureSaleDate: record.saleDate,
          foreclosureDocumentNumber: record.documentNumber,
          foreclosureLink: record.documentNumber
            ? `https://bexar.org/foreclosure/details/${record.documentNumber}`
            : undefined,
        });
        break;
      }
    }

    if (!matched) {
      updatedProperties.push(property);
    }
  }

  return updatedProperties;
}

/**
 * Normalize address for comparison
 */
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd)\b/g, '')
    .trim();
}
