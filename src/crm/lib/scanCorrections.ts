import type { Lead } from '@/crm/data/types'
import { API_BASE_URL, getAuthHeaders } from '@/lib/api'

export const SCAN_FIELDS = [
  'ownerName', 'firm', 'jobTitleIndustry', 'phone', 'secondaryPhone', 'email',
  'website', 'streetAddress', 'city', 'state', 'zip', 'linkedIn',
] as const satisfies readonly (keyof Lead)[]

// Keep unchanged fields too: they supply the denominator for accuracy reports.
export const compareScanFields = (predicted: Partial<Lead>, final: Partial<Lead>) =>
  SCAN_FIELDS.map((fieldName) => ({
    fieldName,
    predictedValue: predicted[fieldName] ?? '',
    finalValue: final[fieldName] ?? '',
  }))

export async function logScanCorrection(rawOcrText: string, predicted: Partial<Lead>, final: Lead): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/crm/scan-corrections`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ rawOcrText, fields: compareScanFields(predicted, final) }),
    })
  } catch { /* Best effort: never retry or interrupt a saved contact. */ }
}
