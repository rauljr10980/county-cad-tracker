import { describe, it, expect } from 'vitest'
import { hasContactSignal, EMAIL_PATTERN, PHONE_PATTERN } from './businessCardText'

describe('hasContactSignal', () => {
  it('is true when the text contains an email address', () => {
    expect(hasContactSignal('John Smith\njohn@example.com')).toBe(true)
  })

  it('is true when the text contains a phone-shaped sequence', () => {
    expect(hasContactSignal('John Smith\n(210) 555-1234')).toBe(true)
  })

  it('is false when the text has neither', () => {
    expect(hasContactSignal('John Smith\nManaging Partner')).toBe(false)
  })

  it('is false for an empty string', () => {
    expect(hasContactSignal('')).toBe(false)
  })
})

describe('EMAIL_PATTERN', () => {
  it('matches a standard email address embedded in other text', () => {
    expect(EMAIL_PATTERN.test('reach me at jane@abcdev.com today')).toBe(true)
  })
})

describe('PHONE_PATTERN', () => {
  it('matches common phone formats', () => {
    expect(PHONE_PATTERN.test('(210) 555-1234')).toBe(true)
    expect(PHONE_PATTERN.test('210-555-1234')).toBe(true)
    expect(PHONE_PATTERN.test('210.555.1234')).toBe(true)
    expect(PHONE_PATTERN.test('+1 210 555 1234')).toBe(true)
  })

  it('does not match a short digit sequence', () => {
    expect(PHONE_PATTERN.test('Suite 400')).toBe(false)
  })
})
