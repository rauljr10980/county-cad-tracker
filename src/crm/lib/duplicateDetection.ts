import type { Lead } from '@/crm/data/types'

type Candidate = Pick<Lead, 'email' | 'phone' | 'ownerName' | 'firm'>

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(-10)

/**
 * Checked in this order — email, then phone, then name+firm — because
 * that is the order of confidence: an email match is almost never a
 * coincidence, a phone match rarely is, and a name+firm match is the
 * weakest signal, which is why it requires both rather than either alone.
 */
export const findPossibleDuplicate = (candidate: Candidate, existingLeads: Lead[]): Lead | null => {
  const email = candidate.email.trim().toLowerCase()
  if (email) {
    const match = existingLeads.find((lead) => lead.email.trim().toLowerCase() === email)
    if (match) return match
  }

  const phone = digitsOnly(candidate.phone)
  if (phone.length === 10) {
    const match = existingLeads.find((lead) => digitsOnly(lead.phone) === phone)
    if (match) return match
  }

  const name = candidate.ownerName.trim().toLowerCase()
  const firm = candidate.firm.trim().toLowerCase()
  if (name && firm) {
    const match = existingLeads.find(
      (lead) =>
        lead.ownerName.trim().toLowerCase() === name &&
        lead.firm.trim().toLowerCase() === firm,
    )
    if (match) return match
  }

  return null
}

/**
 * For the "Update Existing" duplicate-resolution path: the existing
 * lead's own values win wherever it already has one; scanned values fill
 * in only what's currently blank. Never overwrites a field the contact
 * already had.
 */
export const mergeScannedIntoLead = (existing: Lead, scanned: Partial<Lead>): Lead => {
  const merged: Lead = { ...existing }
  ;(Object.keys(scanned) as (keyof Lead)[]).forEach((key) => {
    const existingValue = existing[key]
    const scannedValue = scanned[key]
    if (!existingValue && scannedValue) {
      merged[key] = scannedValue as never
    }
  })
  return merged
}
