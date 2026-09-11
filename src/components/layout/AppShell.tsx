import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearchDialog } from './GlobalSearchDialog'
import { ManagerViewDialog } from './ManagerViewDialog'
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
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isManagerViewOpen, setIsManagerViewOpen] = useState(false)

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
        />
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
    </div>
  )
}
