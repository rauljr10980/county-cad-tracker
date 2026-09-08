import { describe, expect, it } from 'vitest'
import { scanIdentity } from './scanReadiness'
import { parseBusinessCard } from './businessCardParser'

describe('scan quality guards', () => {
  it('rejects the garbled name seen in the reported scan despite readable contact signals', () => {
    const text = 'So £0) 3 BY WY 5 WY WC) a\nRaulBernardoMedina@gmas.com\n(210) 425-7584'
    expect(parseBusinessCard(text).firstName).toBe('')
    expect(scanIdentity(text)).toBeNull()
  })
  it('skips noise before a readable name', () => {
    expect(parseBusinessCard('£0) 3 WY\nRaul Medina').firstName).toBe('Raul')
  })
  it.each(['José O’Neill', 'Anne-Marie Smith', 'J. Smith', 'Cher'])('preserves name punctuation and Unicode: %s', (name) => {
    expect(scanIdentity(`${name}\n210-555-1234`)).not.toBeNull()
  })
  it('requires both identity and contact data', () => {
    expect(scanIdentity('Raul Medina')).toBeNull()
    expect(scanIdentity('210-555-1234')).toBeNull()
  })
  it('agrees across formatting changes but resets on a changed name or email', () => {
    const identity = scanIdentity('Raul Medina\nraul@example.com\n(210) 555-1234')
    expect(identity).toBe(scanIdentity('RAUL MEDINA\nRAUL@example.com\n210-555-1234'))
    expect(identity).not.toBe(scanIdentity('Raul Medlna\nraul@example.com\n210-555-1234'))
    expect(identity).not.toBe(scanIdentity('Raul Medina\nraul@examp1e.com\n210-555-1234'))
  })
})
