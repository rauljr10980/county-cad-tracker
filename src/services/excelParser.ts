/**
 * Excel Parser Service
 * Parses Bexar County tax-delinquent Excel files
 */

import * as XLSX from 'xlsx';
import { Property, PropertyStatus } from '@/types/property';

export interface ParserProgress {
  currentRow: number;
  totalRows: number;
  percentage: number;
  stage: 'reading' | 'parsing' | 'processing' | 'complete';
}

/**
 * Parse Excel file and extract properties
 */
export async function parseExcelFile(
  file: File | Blob,
  onProgress?: (progress: ParserProgress) => void
): Promise<Property[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        onProgress?.({
          currentRow: 0,
          totalRows: 0,
          percentage: 10,
          stage: 'reading',
        });

        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        onProgress?.({
          currentRow: 0,
          totalRows: 0,
          percentage: 30,
          stage: 'parsing',
        });

        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

        onProgress?.({
          currentRow: 0,
          totalRows: jsonData.length,
          percentage: 50,
          stage: 'processing',
        });

        // Parse properties
        const properties: Property[] = [];

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];

          try {
            const property = parsePropertyRow(row, i);
            if (property) {
              properties.push(property);
            }
          } catch (error) {
            console.warn(`Error parsing row ${i}:`, error);
          }

          // Update progress every 100 rows
          if (i % 100 === 0) {
            onProgress?.({
              currentRow: i,
              totalRows: jsonData.length,
              percentage: 50 + Math.round((i / jsonData.length) * 50),
              stage: 'processing',
            });
          }
        }

        onProgress?.({
          currentRow: jsonData.length,
          totalRows: jsonData.length,
          percentage: 100,
          stage: 'complete',
        });

        resolve(properties);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Parse a single property row
 * Adjust column names based on your actual Excel file structure
 */
function parsePropertyRow(row: any, index: number): Property | null {
  // Common column name variations - adjust based on your actual Excel file
  const accountNumber =
    row['Account Number'] ||
    row['ACCOUNT NUMBER'] ||
    row['Account'] ||
    row['acct'] ||
    `UNKNOWN-${index}`;

  const ownerName =
    row['Owner Name'] ||
    row['OWNER NAME'] ||
    row['Owner'] ||
    'Unknown Owner';

  const propertyAddress =
    row['Property Address'] ||
    row['PROPERTY ADDRESS'] ||
    row['Address'] ||
    row['SITUS ADDRESS'] ||
    'Unknown Address';

  const mailingAddress =
    row['Mailing Address'] ||
    row['MAILING ADDRESS'] ||
    row['Mail Address'] ||
    propertyAddress;

  // Status detection (J/A/P)
  const statusCode = row['Status'] || row['STATUS'] || row['Code'] || '';
  const status: PropertyStatus = detectStatus(statusCode);

  const totalAmountDue = parseFloat(
    row['Total Amount Due'] ||
    row['TOTAL AMOUNT DUE'] ||
    row['Amount Due'] ||
    row['AMOUNT'] ||
    '0'
  );

  const totalPercentage = parseFloat(
    row['Percentage'] ||
    row['PERCENT'] ||
    row['%'] ||
    '0'
  );

  const marketValue = parseFloat(
    row['Market Value'] ||
    row['MARKET VALUE'] ||
    row['Value'] ||
    '0'
  );

  const landValue = parseFloat(
    row['Land Value'] ||
    row['LAND VALUE'] ||
    '0'
  );

  const improvementValue = parseFloat(
    row['Improvement Value'] ||
    row['IMPROVEMENT VALUE'] ||
    row['Impr Value'] ||
    '0'
  );

  const legalDescription =
    row['Legal Description'] ||
    row['LEGAL DESCRIPTION'] ||
    row['Legal'] ||
    undefined;

  return {
    id: `prop-${Date.now()}-${index}`,
    accountNumber: String(accountNumber),
    ownerName: String(ownerName),
    propertyAddress: String(propertyAddress),
    mailingAddress: String(mailingAddress),
    status,
    totalAmountDue,
    totalPercentage,
    legalDescription,
    marketValue: marketValue || undefined,
    landValue: landValue || undefined,
    improvementValue: improvementValue || undefined,
  };
}

/**
 * Detect property status from status code
 */
function detectStatus(statusCode: string): PropertyStatus {
  const code = String(statusCode).toUpperCase().trim();

  if (code.includes('J') || code.includes('JUDGMENT')) {
    return 'J';
  } else if (code.includes('A') || code.includes('ACTIVE')) {
    return 'A';
  } else if (code.includes('P') || code.includes('PENDING')) {
    return 'P';
  } else if (code.includes('F') || code.includes('FORECLOS')) {
    return 'F';
  } else if (code.includes('D') || code.includes('DEAD')) {
    return 'D';
  }

  // Default to Active if unknown
  return 'A';
}

/**
 * Auto-detect column mappings from header row
 */
export function detectColumnMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};

  // Define patterns for each field
  const patterns = {
    accountNumber: /account.*number|account|acct/i,
    ownerName: /owner.*name|owner/i,
    propertyAddress: /property.*address|situs.*address|address/i,
    mailingAddress: /mailing.*address|mail.*address/i,
    status: /status|code/i,
    totalAmountDue: /total.*amount|amount.*due|amount/i,
    percentage: /percentage|percent|%/i,
    marketValue: /market.*value|value/i,
    landValue: /land.*value/i,
    improvementValue: /improvement.*value|impr.*value/i,
    legalDescription: /legal.*description|legal/i,
  };

  for (const header of headers) {
    for (const [field, pattern] of Object.entries(patterns)) {
      if (pattern.test(header)) {
        mappings[field] = header;
      }
    }
  }

  return mappings;
}
