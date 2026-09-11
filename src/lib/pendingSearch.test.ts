import { describe, it, expect, beforeEach } from 'vitest'
import { setPendingSearch, consumePendingSearch } from './pendingSearch'

describe('pendingSearch', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns null when nothing was set for that tab', () => {
    expect(consumePendingSearch('properties')).toBeNull()
  })

  it('returns the set value on first consume', () => {
    setPendingSearch('properties', '123 Main St')
    expect(consumePendingSearch('properties')).toBe('123 Main St')
  })

  it('clears the value after consuming it once', () => {
    setPendingSearch('mls', '456 Oak Ave')
    consumePendingSearch('mls')
    expect(consumePendingSearch('mls')).toBeNull()
  })

  it('keeps different tabs independent', () => {
    setPendingSearch('properties', 'A')
    setPendingSearch('crm', 'B')
    expect(consumePendingSearch('crm')).toBe('B')
    expect(consumePendingSearch('properties')).toBe('A')
  })
})
