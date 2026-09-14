import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'
import { tabs, getVisibleTabs } from './navItems'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', username: 'raul', role: 'OPERATOR' } })),
}))

import { useAuth } from '@/contexts/AuthContext'

const noop = () => {}
const defaultProps = {
  activeTab: 'properties' as const,
  onTabChange: noop,
  hiddenTabIds: new Set<string>(),
  onOpenManagerView: noop,
  onOpenEmailSettings: noop,
}

describe('Sidebar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders every tab when nothing is hidden', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Eviction List/ })).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(tabs.length)
  })

  it('hides tabs named in hiddenTabIds', () => {
    render(<Sidebar {...defaultProps} hiddenTabIds={new Set(['dashboard'])} />)
    expect(screen.queryByRole('button', { name: /Dashboard/ })).toBeNull()
  })

  it('marks only the active tab with aria-current', () => {
    render(<Sidebar {...defaultProps} activeTab="properties" />)
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain('Properties')
  })

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn()
    render(<Sidebar {...defaultProps} activeTab="dashboard" onTabChange={onTabChange} />)
    screen.getByRole('button', { name: /Calendar/ }).click()
    expect(onTabChange).toHaveBeenCalledWith('calendar')
  })

  it('renders the Public Website link by default, opening in a new tab', () => {
    render(<Sidebar {...defaultProps} />)
    const link = screen.getByRole('link', { name: /Public Website/ })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('hides the Public Website link when publicSite is in hiddenTabIds', () => {
    render(<Sidebar {...defaultProps} hiddenTabIds={new Set(['publicSite'])} />)
    expect(screen.queryByRole('link', { name: /Public Website/ })).toBeNull()
  })

  it('does not render a Settings item for a non-ADMIN user', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /Settings/ })).toBeNull()
  })

  it('renders a Settings item for an ADMIN user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' } } as any)
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Settings/ })).toBeTruthy()
  })

  it('does not render a Management item for a non-ADMIN user', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /Management/ })).toBeNull()
  })

  it('renders a Management item for an ADMIN user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2', username: 'admin', role: 'ADMIN' } } as any)
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Management/ })).toBeTruthy()
  })
})
