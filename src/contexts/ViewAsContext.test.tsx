import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ViewAsProvider, useViewAs } from './ViewAsContext'
import { VIEW_AS_STORAGE_KEY } from '@/lib/api'
import * as api from '@/lib/api'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'

const asAuth = (value: unknown) => (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value)

function stubLocalStorage() {
  const store: Record<string, string> = {}

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key])
    },
    key: (index: number) => {
      const keys = Object.keys(store)
      return keys[index] || null
    },
    length: 0,
  })
}

function Probe() {
  const { viewAsUserId } = useViewAs()
  return <span data-testid="viewing">{viewAsUserId ?? 'self'}</span>
}

const renderProbe = () =>
  render(
    <ViewAsProvider>
      <Probe />
    </ViewAsProvider>
  )

describe('ViewAsContext', () => {
  beforeEach(() => {
    stubLocalStorage()
    vi.spyOn(api, 'getUsers').mockResolvedValue({ users: [] })
  })
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('restores a stored selection for a Manager', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' }, isLoading: false })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('teammate-1'))
  })

  it('clears a stored selection for a non-Manager', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: { id: 'op1', username: 'raul', role: 'OPERATOR' }, isLoading: false })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('self'))
    expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull()
  })

  it('clears a stale selection naming the Manager themselves', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'mgr1')
    asAuth({ user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' }, isLoading: false })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('self'))
    expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull()
  })

  it('clears the selection on logout', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: null, isLoading: false })
    renderProbe()
    await waitFor(() => expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull())
  })

  it('does not touch storage while auth is still resolving', async () => {
    localStorage.setItem(VIEW_AS_STORAGE_KEY, 'teammate-1')
    asAuth({ user: null, isLoading: true })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('viewing').textContent).toBe('self'))
    expect(localStorage.getItem(VIEW_AS_STORAGE_KEY)).toBe('teammate-1')
  })

  it('excludes the signed-in Manager from the teammate list', async () => {
    vi.spyOn(api, 'getUsers').mockResolvedValue({
      users: [
        { id: 'mgr1', username: 'robbie', email: 'r@x.com', role: 'ADMIN', isActive: true, createdAt: '' },
        { id: 'op1', username: 'raul', email: 'a@x.com', role: 'OPERATOR', isActive: true, createdAt: '' },
      ],
    })
    asAuth({ user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' }, isLoading: false })

    function ListProbe() {
      const { teamMembers } = useViewAs()
      return <span data-testid="names">{teamMembers.map((m) => m.username).join(',')}</span>
    }
    render(
      <ViewAsProvider>
        <ListProbe />
      </ViewAsProvider>
    )
    await waitFor(() => expect(screen.getByTestId('names').textContent).toBe('raul'))
  })
})
