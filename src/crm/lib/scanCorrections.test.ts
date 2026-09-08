import { afterEach, describe, expect, it, vi } from 'vitest'
import { compareScanFields, logScanCorrection } from './scanCorrections'
import type { Lead } from '@/crm/data/types'

vi.mock('@/lib/api', () => ({ API_BASE_URL: 'http://localhost', getAuthHeaders: () => ({ Authorization: 'Bearer test' }) }))
afterEach(() => vi.unstubAllGlobals())

describe('scan corrections', () => {
  it('preserves all twelve observations, including edits, cleared values and unchanged fields', () => {
    const result = compareScanFields({ ownerName: 'Raul', firm: 'CBRE', phone: '123' }, { ownerName: 'Raul Medina', firm: 'CBRE', phone: '' })
    expect(result).toHaveLength(12)
    expect(result).toContainEqual({ fieldName: 'ownerName', predictedValue: 'Raul', finalValue: 'Raul Medina' })
    expect(result).toContainEqual({ fieldName: 'firm', predictedValue: 'CBRE', finalValue: 'CBRE' })
    expect(result).toContainEqual({ fieldName: 'phone', predictedValue: '123', finalValue: '' })
    expect(result).toContainEqual({ fieldName: 'zip', predictedValue: '', finalValue: '' })
    expect(result.some(f => ['source', 'businessName'].includes(f.fieldName))).toBe(false)
  })

  it.each([true, false])('sends one authenticated text-only request for HTTP success=%s', async (ok) => {
    const fetch = vi.fn().mockResolvedValue({ ok })
    vi.stubGlobal('fetch', fetch)
    await logScanCorrection('Raul CBRE', { ownerName: 'Raul' }, { ownerName: 'Raul Medina' } as Lead)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [, request] = fetch.mock.calls[0]
    expect(request.headers.Authorization).toBe('Bearer test')
    expect(Object.keys(JSON.parse(request.body))).toEqual(['rawOcrText', 'fields'])
  })

  it('swallows network failures without retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    await expect(logScanCorrection('Raul', {}, {} as Lead)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
