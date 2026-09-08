import type { Lead } from '@/crm/data/types'
import type { ParsedBusinessCard } from '@/crm/lib/businessCardParser'

/**
 * Bridges the parser's raw field names to the CRM's existing Lead schema
 * — see the design spec's field-reuse decisions: Name -> ownerName,
 * Company -> firm/businessName, Job Title -> jobTitleIndustry, and City
 * -> city already existed and mean the right thing; everything else here
 * is genuinely new.
 */
export const mapScannedCardToLead = (parsed: ParsedBusinessCard): Partial<Lead> => ({
  ownerName: [parsed.firstName, parsed.lastName].filter(Boolean).join(' '),
  firm: parsed.company,
  businessName: parsed.company,
  jobTitleIndustry: parsed.jobTitle,
  phone: parsed.phone,
  secondaryPhone: parsed.secondaryPhone,
  email: parsed.email,
  website: parsed.website,
  streetAddress: parsed.streetAddress,
  city: parsed.city,
  state: parsed.state,
  zip: parsed.zip,
  linkedIn: parsed.linkedIn,
  source: 'Business Card',
})
