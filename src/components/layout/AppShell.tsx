import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearchDialog } from './GlobalSearchDialog'
import { ManagerViewDialog } from './ManagerViewDialog'
import EmailSettingsDialog from './EmailSettingsDialog'
import { useViewAs } from '@/contexts/ViewAsContext'
import type { TabType } from './navItems'

interface AppShellProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onHiddenTabsSaved: (ids: Set<string>) => void
  onRefresh: () => void
  isRefreshing: boolean
  children: React.ReactNode
}

export function AppShell({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved, onRefresh, isRefreshing, children }: AppShellProps) {
  const { viewAsUser, viewAsUserId, setViewAs } = useViewAs()
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isManagerViewOpen, setIsManagerViewOpen] = useState(false)
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        hiddenTabIds={hiddenTabIds}
        onOpenManagerView={() => setIsManagerViewOpen(true)}
        onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          hiddenTabIds={hiddenTabIds}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenManagerView={() => setIsManagerViewOpen(true)}
          onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
        />
        {viewAsUserId && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
          >
            <span className="font-medium">
              Viewing {viewAsUser?.username ?? 'a teammate'}'s account as Manager — anything you
              change saves to {viewAsUser?.username ?? 'them'}.
            </span>
            <button
              type="button"
              onClick={() => setViewAs(null)}
              className="ml-auto rounded-md border border-amber-500/50 px-2 py-1 text-xs font-medium hover:bg-amber-500/20"
            >
              Exit
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <main className="container mx-auto animate-fade-in overflow-x-hidden">{children}</main>
        </div>
      </div>
      <GlobalSearchDialog open={isSearchOpen} onOpenChange={setIsSearchOpen} onNavigate={onTabChange} />
      <ManagerViewDialog
        isOpen={isManagerViewOpen}
        onClose={() => setIsManagerViewOpen(false)}
        onHiddenTabsSaved={onHiddenTabsSaved}
      />
      <EmailSettingsDialog
        isOpen={isEmailSettingsOpen}
        onClose={() => setIsEmailSettingsOpen(false)}
      />
    </div>
  )
}
