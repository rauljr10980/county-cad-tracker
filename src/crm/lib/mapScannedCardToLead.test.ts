import { describe, it, expect } from 'vitest'
import { mapScannedCardToLead } from './mapScannedCardToLead'
import type { ParsedBusinessCard } from './businessCardParser'

const emptyParsed: ParsedBusinessCard = {
  firstName: '', lastName: '', company: '', jobTitle: '',
  phone: '', secondaryPhone: '', email: '', website: '',
  streetAddress: '', city: '', state: '', zip: '', linkedIn: '',
}

describe('mapScannedCardToLead', () => {
  it('joins first and last name into ownerName', () => {
    const result = mapScannedCardToLead({ ...emptyParsed, firstName: 'John', lastName: 'Smith' })
    expect(result.ownerName).toBe('John Smith')
  })

  it('leaves ownerName blank when neither name part was parsed', () => {
    expect(mapScannedCardToLead(emptyParsed).ownerName).toBe('')
  })

  it('maps company to both firm and businessName, matching how manual entry keeps them in sync', () => {
    const result = mapScannedCardToLead({ ...emptyParsed, company: 'ABC Development LLC' })
    expect(result.firm).toBe('ABC Development LLC')
    expect(result.businessName).toBe('ABC Development LLC')
  })

  it('maps jobTitle to jobTitleIndustry', () => {
    expect(mapScannedCardToLead({ ...emptyParsed, jobTitle: 'Managing Partner' }).jobTitleIndustry).toBe('Managing Partner')
  })

  it('sets source to Business Card', () => {
    expect(mapScannedCardToLead(emptyParsed).source).toBe('Business Card')
  })

  it('passes through the remaining new fields unchanged', () => {
    const parsed: ParsedBusinessCard = {
      ...emptyParsed,
      phone: '(210) 555-1234', secondaryPhone: '(210) 555-9999',
      email: 'john@abc.com', website: 'abc.com',
      streetAddress: '123 Main St', city: 'San Antonio', state: 'TX', zip: '78205',
      linkedIn: 'linkedin.com/in/john',
    }
    const result = mapScannedCardToLead(parsed)
    expect(result.phone).toBe('(210) 555-1234')
    expect(result.secondaryPhone).toBe('(210) 555-9999')
    expect(result.email).toBe('john@abc.com')
    expect(result.website).toBe('abc.com')
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.city).toBe('San Antonio')
    expect(result.state).toBe('TX')
    expect(result.zip).toBe('78205')
    expect(result.linkedIn).toBe('linkedin.com/in/john')
  })
})
