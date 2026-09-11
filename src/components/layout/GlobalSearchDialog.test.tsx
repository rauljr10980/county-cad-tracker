import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlobalSearchDialog } from './GlobalSearchDialog'
import * as api from '@/lib/api'
import * as pendingSearch from '@/lib/pendingSearch'

// jsdom has no ResizeObserver; cmdk's Command component uses one internally
// (to measure item heights) and throws without this stub. Not a concern of
// GlobalSearchDialog itself — command.tsx is pre-existing and unchanged.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? ResizeObserverStub

// jsdom also has no Element.scrollIntoView. cmdk calls it (in a layout
// effect) when auto-selecting the first item after filtering; left
// unpolyfilled, that throws during commit and silently aborts the internal
// re-render that would otherwise make a matching CommandItem visible — which
// is what was actually causing results to never appear in this suite (not a
// user.type/fake-timer flakiness issue as originally anticipated).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoViewStub() {}
}

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not search until at least 2 characters are typed', async () => {
    const searchAllSpy = vi.spyOn(api, 'searchAll').mockResolvedValue([])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={() => {}} onNavigate={() => {}} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'a')
    vi.advanceTimersByTime(500)
    expect(searchAllSpy).not.toHaveBeenCalled()
  })

  it('searches (debounced) once 2+ characters are typed, and groups results by type', async () => {
    vi.spyOn(api, 'searchAll').mockResolvedValue([
      { type: 'property', id: 'p1', label: '123 Main St', sublabel: 'Jane Doe', tab: 'properties' },
      { type: 'crmLead', id: 'c1', label: 'Sam Lee', sublabel: '2105551212', tab: 'crm' },
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={() => {}} onNavigate={() => {}} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'main')
    vi.advanceTimersByTime(400)

    await waitFor(() => expect(screen.getByText('123 Main St')).toBeTruthy())
    expect(screen.getByText('Sam Lee')).toBeTruthy()
    expect(screen.getByText('Properties')).toBeTruthy()
    expect(screen.getByText('Contacts')).toBeTruthy()
  })

  it('selecting a result sets a pending search, navigates to its tab, and closes', async () => {
    vi.spyOn(api, 'searchAll').mockResolvedValue([
      { type: 'property', id: 'p1', label: '123 Main St', sublabel: 'Jane Doe', tab: 'properties' },
    ])
    const setPendingSearchSpy = vi.spyOn(pendingSearch, 'setPendingSearch')
    const onNavigate = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} onNavigate={onNavigate} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'main')
    vi.advanceTimersByTime(400)
    await waitFor(() => expect(screen.getByText('123 Main St')).toBeTruthy())

    await user.click(screen.getByText('123 Main St'))

    expect(setPendingSearchSpy).toHaveBeenCalledWith('properties', '123 Main St')
    expect(onNavigate).toHaveBeenCalledWith('properties')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows an inline error message and keeps the dialog open when the search call fails', async () => {
    vi.spyOn(api, 'searchAll').mockRejectedValue(new Error('Search failed'))
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} onNavigate={() => {}} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'main')
    vi.advanceTimersByTime(400)

    await waitFor(() => expect(screen.getByText(/search failed/i)).toBeTruthy())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
