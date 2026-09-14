import { Building2, ChevronDown, FileText, LogOut, Mail, Settings, Upload, UserCog, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { AvatarInitials } from '@/components/ui/avatar-initials'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { externalNavItem, getVisibleTabs, isPublicSiteVisible, type TabType } from './navItems'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Manager',
  OPERATOR: 'Team Member',
  VIEWER: 'Viewer',
}

const itemClasses = (isActive: boolean) =>
  cn(
    'flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    isActive ? 'text-white' : 'text-white/70 hover:text-white'
  )

interface SidebarProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  hiddenTabIds: Set<string>
  onOpenManagerView: () => void
  onOpenEmailSettings: () => void
}

export function Sidebar({ activeTab, onTabChange, hiddenTabIds, onOpenManagerView, onOpenEmailSettings }: SidebarProps) {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const visibleTabs = getVisibleTabs(hiddenTabIds)

  return (
    <nav
      aria-label="Sections"
      className="hidden md:flex w-64 shrink-0 flex-col py-4"
      style={{ backgroundColor: 'hsl(var(--navy))' }}
    >
      <div className="mb-6 flex items-center gap-3 px-4">
        <Building2 className="h-7 w-7 text-white" />
        <div>
          <p className="text-sm font-semibold leading-tight text-white">Bexar CRE Acquisition CRM</p>
          <p className="text-xs leading-tight text-white/60">San Antonio, TX</p>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={itemClasses(isActive)}
                style={isActive ? { backgroundColor: 'hsl(var(--navy-mid))' } : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {tab.label}
              </button>
            </li>
          )
        })}
        {isPublicSiteVisible(hiddenTabIds) && (
          <li>
            <a
              href={externalNavItem.href}
              target="_blank"
              rel="noopener noreferrer"
              className={itemClasses(false)}
            >
              <externalNavItem.icon className="h-[18px] w-[18px] shrink-0" />
              {externalNavItem.label}
            </a>
          </li>
        )}
        {isAdmin && (
          <li>
            <button type="button" onClick={() => onTabChange('team')} className={itemClasses(activeTab === 'team')}>
              <Users className="h-[18px] w-[18px] shrink-0" />
              Team
            </button>
          </li>
        )}
        {isAdmin && (
          <li>
            <button type="button" onClick={() => onTabChange('management')} className={itemClasses(activeTab === 'management')}>
              <UserCog className="h-[18px] w-[18px] shrink-0" />
              Management
            </button>
          </li>
        )}
        {isAdmin && (
          <li>
            <button type="button" onClick={onOpenManagerView} className={itemClasses(false)}>
              <Settings className="h-[18px] w-[18px] shrink-0" />
              Settings
            </button>
          </li>
        )}
      </ul>

      {user && (
        <div className="mt-auto px-2 pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-white/90 hover:bg-[hsl(var(--navy-mid))]"
              >
                <AvatarInitials name={user.username} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.username}</span>
                  <span className="block truncate text-xs text-white/60">{ROLE_LABELS[user.role ?? ''] ?? 'Team Member'}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.username}</p>
                  {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onTabChange('upload')}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTabChange('files')}>
                <FileText className="h-4 w-4 mr-2" />
                Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenEmailSettings}>
                <Mail className="h-4 w-4 mr-2" />
                Email Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </nav>
  )
}
