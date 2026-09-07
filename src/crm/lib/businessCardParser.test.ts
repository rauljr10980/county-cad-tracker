import { describe, it, expect } from 'vitest'
import { parseBusinessCard } from './businessCardParser'

describe('parseBusinessCard', () => {
  it('extracts an email', () => {
    expect(parseBusinessCard('John Smith\njohn@abcdevelopment.com').email).toBe('john@abcdevelopment.com')
  })

  it('extracts a phone number in common formats', () => {
    expect(parseBusinessCard('Jane Doe\n(210) 555-1234').phone).toBe('(210) 555-1234')
    expect(parseBusinessCard('Jane Doe\n210-555-1234').phone).toBe('210-555-1234')
    expect(parseBusinessCard('Jane Doe\n210.555.1234').phone).toBe('210.555.1234')
    expect(parseBusinessCard('Jane Doe\n+1 210 555 1234').phone).toBe('+1 210 555 1234')
  })

  it('extracts a second phone number as secondaryPhone', () => {
    const result = parseBusinessCard('Jane Doe\n(210) 555-1234\n(210) 555-9999')
    expect(result.phone).toBe('(210) 555-1234')
    expect(result.secondaryPhone).toBe('(210) 555-9999')
  })

  it('leaves secondaryPhone empty when there is only one phone number', () => {
    expect(parseBusinessCard('Jane Doe\n(210) 555-1234').secondaryPhone).toBe('')
  })

  it('extracts a LinkedIn line', () => {
    expect(parseBusinessCard('John Smith\nlinkedin.com/in/johnsmith').linkedIn).toBe('linkedin.com/in/johnsmith')
  })

  it('extracts a website that is not the email domain', () => {
    const result = parseBusinessCard('John Smith\njohn@abcdevelopment.com\nabcdevelopment.com')
    expect(result.website).toBe('abcdevelopment.com')
  })

  it('does not mistake the email domain for a separate website', () => {
    expect(parseBusinessCard('John Smith\njohn@abcdevelopment.com').website).toBe('')
  })

  it('splits a two-line address into street, city, state, and zip', () => {
    const result = parseBusinessCard('John Smith\n123 Main St\nSan Antonio, TX 78205')
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.city).toBe('San Antonio')
    expect(result.state).toBe('TX')
    expect(result.zip).toBe('78205')
  })

  it('splits a one-line combined address into street, city, state, and zip', () => {
    const result = parseBusinessCard('John Smith\n123 Main St, San Antonio, TX 78205')
    expect(result.streetAddress).toBe('123 Main St')
    expect(result.city).toBe('San Antonio')
    expect(result.state).toBe('TX')
    expect(result.zip).toBe('78205')
  })

  it('handles a 9-digit ZIP', () => {
    expect(parseBusinessCard('John Smith\nSan Antonio, TX 78205-1234').zip).toBe('78205-1234')
  })

  it('extracts a company line by its legal suffix', () => {
    expect(parseBusinessCard('John Smith\nABC Development LLC').company).toBe('ABC Development LLC')
  })

  it('extracts a title line by its role word', () => {
    expect(parseBusinessCard('John Smith\nManaging Partner').jobTitle).toBe('Managing Partner')
  })

  it('claims a company line before title, even when it contains a role word', () => {
    const result = parseBusinessCard('John Smith\nPartners Realty Group')
    expect(result.company).toBe('Partners Realty Group')
    expect(result.jobTitle).toBe('')
  })

  it('splits a two-word first line into first and last name', () => {
    const result = parseBusinessCard('John Smith')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
  })

  it('treats a single-word name as first name only', () => {
    const result = parseBusinessCard('Cher')
    expect(result.firstName).toBe('Cher')
    expect(result.lastName).toBe('')
  })

  it('takes the first unclaimed line as the name, even if it is not first overall', () => {
    const result = parseBusinessCard('ABC Development LLC\nJohn Smith\njohn@abcdevelopment.com')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Smith')
    expect(result.company).toBe('ABC Development LLC')
  })

  it('drops a line matching nothing rather than misassigning it', () => {
    const result = parseBusinessCard('John Smith\n"Building relationships since 1998"')
    expect(result.firstName).toBe('John')
    expect(Object.values(result)).not.toContain('"Building relationships since 1998"')
  })

  it('returns every field as an empty string for blank input', () => {
    expect(parseBusinessCard('')).toEqual({
      firstName: '', lastName: '', company: '', jobTitle: '',
      phone: '', secondaryPhone: '', email: '', website: '',
      streetAddress: '', city: '', state: '', zip: '', linkedIn: '',
    })
  })

  it('returns every field as an empty string for whitespace-only input', () => {
    const result = parseBusinessCard('   \n  \n  ')
    expect(result.firstName).toBe('')
    expect(result.email).toBe('')
  })
})
