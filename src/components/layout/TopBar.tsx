import { useEffect, useState } from 'react'
import { Bell, FileText, LogOut, Menu, RefreshCw, Search, Settings, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { getNotifications, type Notification } from '@/lib/api'
import { getVisibleTabs, type TabType } from './navItems'
import { ManagerViewDialog } from './ManagerViewDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const POLL_INTERVAL_MS = 2 * 60 * 1000

interface TopBarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onHiddenTabsSaved: (ids: Set<string>) => void
  onRefresh: () => void
  isRefreshing: boolean
  onOpenSearch: () => void
}

export function TopBar({ activeTab, onTabChange, hiddenTabIds, onHiddenTabsSaved, onRefresh, isRefreshing, onOpenSearch }: TopBarProps) {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [count, setCount] = useState(0)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isManagerViewOpen, setIsManagerViewOpen] = useState(false)

  const loadNotifications = () => {
    getNotifications()
      .then((data) => {
        setNotifications(data.notifications)
        setCount(data.count)
      })
      .catch(() => {
        // Leave the last-known badge/list in place on a transient failure
        // rather than flashing it to empty (see this phase's spec).
      })
  }

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      setIsMobileMenuOpen(false)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const visibleTabs = getVisibleTabs(hiddenTabIds)

  return (
    <header className="border-b bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex flex-1 max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/50"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate" data-placeholder>
            Search contacts, addresses, opportunities, or anything...
          </span>
          <kbd className="hidden sm:inline rounded border bg-muted px-1.5 py-0.5 text-xs">⌘K</kbd>
        </button>
        {/* A visually-hidden real input carries the placeholder text so
            screen readers and text-based test queries (getByPlaceholderText)
            can find this trigger the same way they would a real search box. */}
        <input readOnly placeholder="Search contacts, addresses, opportunities, or anything..." onClick={onOpenSearch} className="sr-only" tabIndex={-1} />

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Popover open={isNotifOpen} onOpenChange={(open) => { setIsNotifOpen(open); if (open) loadNotifications() }}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {count > 0 && (
                  <span data-testid="notification-badge" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              {notifications.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>
              ) : (
                <ul className="space-y-1">
                  {notifications.map((n) => (
                    <li key={`${n.type}-${n.id}`}>
                      <button
                        type="button"
                        onClick={() => { onTabChange(n.tab as TabType); setIsNotifOpen(false) }}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        {n.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>

          {/* Mobile: hamburger opens tab nav + account actions. Desktop nav
              lives in Sidebar; desktop account menu lives in Sidebar's
              footer — this Sheet is mobile-only. */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}>
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 mt-6">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <Button
                      key={tab.id}
                      variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                      className="justify-start mobile-touch-target"
                      onClick={() => { setIsMobileMenuOpen(false); onTabChange(tab.id) }}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {tab.label}
                    </Button>
                  )
                })}

                <div className="my-2 border-t" />

                <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('upload') }}>
                  <Upload className="h-5 w-5 mr-3" />
                  Upload
                </Button>
                <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); onTabChange('files') }}>
                  <FileText className="h-5 w-5 mr-3" />
                  Files
                </Button>
                {isAdmin && (
                  <Button variant="ghost" className="justify-start mobile-touch-target" onClick={() => { setIsMobileMenuOpen(false); setIsManagerViewOpen(true) }}>
                    <Settings className="h-5 w-5 mr-3" />
                    Manager Settings
                  </Button>
                )}
                <Button variant="ghost" className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10 mobile-touch-target" onClick={handleLogout}>
                  <LogOut className="h-5 w-5 mr-3" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {isAdmin && (
        <ManagerViewDialog
          isOpen={isManagerViewOpen}
          onClose={() => setIsManagerViewOpen(false)}
          onHiddenTabsSaved={onHiddenTabsSaved}
        />
      )}
    </header>
  )
}
