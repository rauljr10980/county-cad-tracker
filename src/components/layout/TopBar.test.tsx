import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import * as api from '@/lib/api'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', username: 'raul', role: 'OPERATOR' }, logout: vi.fn() })),
}))

vi.mock('@/contexts/ViewAsContext', () => ({
  useViewAs: vi.fn(() => ({
    viewAsUserId: null,
    viewAsUser: null,
    teamMembers: [],
    setViewAs: vi.fn(),
  })),
}))

import { useAuth } from '@/contexts/AuthContext'
import { useViewAs } from '@/contexts/ViewAsContext'

const noop = () => {}
const defaultProps = {
  activeTab: 'properties' as const,
  onTabChange: noop,
  hiddenTabIds: new Set<string>(),
  onRefresh: noop,
  isRefreshing: false,
  onOpenSearch: noop,
  onOpenManagerView: noop,
  onOpenEmailSettings: noop,
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({ notifications: [], count: 0 })
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders a search trigger button with the mockup text as its accessible name', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /search contacts, addresses, opportunities/i })).toBeTruthy()
  })

  it('clicking the search trigger button calls onOpenSearch', async () => {
    const onOpenSearch = vi.fn()
    render(<TopBar {...defaultProps} onOpenSearch={onOpenSearch} />)
    screen.getByRole('button', { name: /search contacts, addresses, opportunities/i }).click()
    expect(onOpenSearch).toHaveBeenCalled()
  })

  it('shows a notification badge when count > 0', async () => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({
      notifications: [{ type: 'followup', id: 'f1', message: 'Follow-up due: 123 Main St', timestamp: '2026-09-11T00:00:00.000Z', tab: 'properties' }],
      count: 1,
    })
    render(<TopBar {...defaultProps} />)
    await waitFor(() => expect(screen.getByTestId('notification-badge')).toBeTruthy())
  })

  it('does not show a notification badge when count is 0', async () => {
    render(<TopBar {...defaultProps} />)
    await waitFor(() => expect(api.getNotifications).toHaveBeenCalled())
    expect(screen.queryByTestId('notification-badge')).toBeNull()
  })

  it('shows an error message, not the all-clear empty state, when the first notifications load fails', async () => {
    vi.spyOn(api, 'getNotifications').mockRejectedValue(new Error('network error'))
    render(<TopBar {...defaultProps} />)
    await waitFor(() => expect(api.getNotifications).toHaveBeenCalled())

    screen.getByRole('button', { name: /notifications/i }).click()

    await waitFor(() => expect(screen.getByText(/couldn't load notifications/i)).toBeTruthy())
    expect(screen.queryByText(/nothing needs attention right now/i)).toBeNull()
  })

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(<TopBar {...defaultProps} onRefresh={onRefresh} />)
    screen.getByRole('button', { name: /refresh/i }).click()
    expect(onRefresh).toHaveBeenCalled()
  })

  it('mobile menu button opens a sheet listing visible tabs', async () => {
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Calendar/ })).toBeTruthy())
  })

  it('mobile sheet also lists account actions (Upload, Files, Logout) but not Manager Settings for a non-admin', async () => {
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy())
    expect(screen.getByRole('button', { name: /Files/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Logout/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Manager Settings/ })).toBeNull()
  })

  it('mobile sheet lists Manager Settings for an ADMIN user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' }, logout: vi.fn() } as any)
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Manager Settings/ })).toBeTruthy())
  })

  it('mobile sheet does not list Management for a non-admin', async () => {
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Management/ })).toBeNull()
  })

  it('mobile sheet lists Management for an ADMIN user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' }, logout: vi.fn() } as any)
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Management/ })).toBeTruthy())
  })

  it('mobile sheet does not list Dashboard for a non-admin', async () => {
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Dashboard/ })).toBeNull()
  })

  it('mobile sheet lists Dashboard for an ADMIN user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' }, logout: vi.fn() } as any)
    render(<TopBar {...defaultProps} />)
    screen.getByRole('button', { name: /open menu/i }).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Dashboard/ })).toBeTruthy())
  })
})

describe('TopBar view-as picker', () => {
  const asViewAs = (value: unknown) =>
    (useViewAs as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value)

  const teammates = [
    { id: 'op1', username: 'raul', email: 'a@x.com', role: 'OPERATOR' as const, isActive: true, createdAt: '' },
  ]

  beforeEach(() => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({ notifications: [], count: 0 })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the picker to a Manager who has teammates', () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' },
      logout: vi.fn(),
    })
    asViewAs({ viewAsUserId: null, viewAsUser: null, teamMembers: teammates, setViewAs: vi.fn() })
    render(<TopBar {...defaultProps} />)
    expect(screen.getByLabelText(/view as teammate/i)).toBeTruthy()
  })

  it('hides the picker from a non-Manager', () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'op1', username: 'raul', role: 'OPERATOR' },
      logout: vi.fn(),
    })
    asViewAs({ viewAsUserId: null, viewAsUser: null, teamMembers: teammates, setViewAs: vi.fn() })
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByLabelText(/view as teammate/i)).toBeNull()
  })

  it('hides the picker from a Manager with no teammates', () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'mgr1', username: 'robbie', role: 'ADMIN' },
      logout: vi.fn(),
    })
    asViewAs({ viewAsUserId: null, viewAsUser: null, teamMembers: [], setViewAs: vi.fn() })
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByLabelText(/view as teammate/i)).toBeNull()
  })
})
