import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import * as api from '@/lib/api'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', username: 'raul', role: 'OPERATOR' }, logout: vi.fn() })),
}))

import { useAuth } from '@/contexts/AuthContext'

const noop = () => {}
const defaultProps = {
  activeTab: 'properties' as const,
  onTabChange: noop,
  hiddenTabIds: new Set<string>(),
  onHiddenTabsSaved: noop,
  onRefresh: noop,
  isRefreshing: false,
  onOpenSearch: noop,
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getNotifications').mockResolvedValue({ notifications: [], count: 0 })
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders a search trigger with the mockup placeholder text', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByPlaceholderText(/search contacts, addresses, opportunities/i)).toBeTruthy()
  })

  it('clicking the search trigger calls onOpenSearch', async () => {
    const onOpenSearch = vi.fn()
    render(<TopBar {...defaultProps} onOpenSearch={onOpenSearch} />)
    screen.getByPlaceholderText(/search contacts, addresses, opportunities/i).click()
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
})
