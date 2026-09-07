import { describe, it, expect } from 'vitest'
import { findPossibleDuplicate, mergeScannedIntoLead } from './duplicateDetection'
import type { Lead } from '@/crm/data/types'

const baseLead: Lead = {
  id: '1', businessName: 'ABC Development LLC', ownerName: 'John Smith',
  jobTitleIndustry: 'Managing Partner', firm: 'ABC Development LLC',
  phone: '(210) 555-1234', email: 'john@abcdevelopment.com',
  industry: 'Other', city: 'San Antonio', asset: '', specialization: '',
  metPersonally: '', source: 'Referral', websiteStatus: 'This Week',
  connectionRating: 'none', lastConversationNotes: '', notes: '',
  kind: 'industry', lastContactedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  secondaryPhone: '', website: '', streetAddress: '', state: '', zip: '',
  linkedIn: '', relationshipType: '',
}

describe('findPossibleDuplicate', () => {
  it('matches on exact email, case-insensitively', () => {
    const found = findPossibleDuplicate(
      { email: 'JOHN@ABCDEVELOPMENT.COM', phone: '', ownerName: '', firm: '' },
      [baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('matches on phone, ignoring formatting differences', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '210.555.1234', ownerName: '', firm: '' },
      [baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('matches on name and firm together, case-insensitively', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '', ownerName: 'john smith', firm: 'abc development llc' },
      [baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('does not match on name alone without a matching firm', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '', ownerName: 'John Smith', firm: 'A Different Company' },
      [baseLead],
    )
    expect(found).toBeNull()
  })

  it('does not match on firm alone without a matching name', () => {
    const found = findPossibleDuplicate(
      { email: '', phone: '', ownerName: 'Someone Else', firm: 'ABC Development LLC' },
      [baseLead],
    )
    expect(found).toBeNull()
  })

  it('returns null when nothing matches', () => {
    const found = findPossibleDuplicate(
      { email: 'new@example.com', phone: '555-000-0000', ownerName: 'Nobody', firm: 'Nothing' },
      [baseLead],
    )
    expect(found).toBeNull()
  })

  it('checks email before phone before name+firm, returning the first hit', () => {
    const secondLead: Lead = { ...baseLead, id: '2', email: 'different@example.com', phone: '999-999-9999' }
    const found = findPossibleDuplicate(
      { email: 'john@abcdevelopment.com', phone: '999-999-9999', ownerName: '', firm: '' },
      [secondLead, baseLead],
    )
    expect(found?.id).toBe('1')
  })

  it('returns null against an empty lead list', () => {
    expect(findPossibleDuplicate({ email: 'john@abcdevelopment.com', phone: '', ownerName: '', firm: '' }, [])).toBeNull()
  })
})

describe('mergeScannedIntoLead', () => {
  it('fills in a blank field from the scan', () => {
    const existing: Lead = { ...baseLead, website: '' }
    const merged = mergeScannedIntoLead(existing, { website: 'abcdevelopment.com' })
    expect(merged.website).toBe('abcdevelopment.com')
  })

  it('keeps the existing value when the field is already set', () => {
    const existing: Lead = { ...baseLead, phone: '(210) 555-0000' }
    const merged = mergeScannedIntoLead(existing, { phone: '(210) 555-9999' })
    expect(merged.phone).toBe('(210) 555-0000')
  })

  it('leaves a field blank when neither existing nor scanned has a value', () => {
    const existing: Lead = { ...baseLead, linkedIn: '' }
    const merged = mergeScannedIntoLead(existing, { linkedIn: '' })
    expect(merged.linkedIn).toBe('')
  })

  it('does not touch fields the scan did not include', () => {
    const existing: Lead = { ...baseLead, notes: 'Met at conference' }
    const merged = mergeScannedIntoLead(existing, { website: 'new-site.com' })
    expect(merged.notes).toBe('Met at conference')
  })
})
