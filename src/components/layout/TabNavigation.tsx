import { cn } from '@/lib/utils';
import { LayoutDashboard, CalendarDays, List, Home, Car, Gavel, Briefcase } from 'lucide-react';


export type TabType = 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload' | 'files' | 'preforeclosure' | 'driving' | 'foreclosure' | 'crm' | 'evictions';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Dash' },
  { id: 'calendar' as TabType, label: 'Calendar', icon: CalendarDays, shortLabel: 'Cal' },
  { id: 'properties' as TabType, label: 'Properties', icon: List, shortLabel: 'Props' },
  { id: 'preforeclosure' as TabType, label: 'Pre-Foreclosure', icon: Home, shortLabel: 'Pre-FC' },
  { id: 'foreclosure' as TabType, label: 'Foreclosure', icon: Gavel, shortLabel: 'FC' },
  { id: 'crm' as TabType, label: 'CRM', icon: Briefcase, shortLabel: 'CRM' },
  { id: 'driving' as TabType, label: 'Driving 4$', icon: Car, shortLabel: 'D4$' },
  { id: 'evictions' as TabType, label: 'Eviction List', icon: Gavel, shortLabel: 'Evict' },
];

/**
 * Tabs hidden from the nav. Empty means every tab shows.
 *
 * Hiding only removes the visual entry point — a hidden tab still renders when
 * reached by hash (e.g. #properties), so bookmarks and links keep working. Add
 * a TabType here to hide it again.
 */
const HIDDEN_TABS = new Set<TabType>([]);

const visibleTabs = tabs.filter((tab) => !HIDDEN_TABS.has(tab.id));

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="border-b border-border bg-card/30 sticky top-[57px] md:top-[61px] z-40">
      <div className="container mx-auto px-2 md:px-4">
        <div className="flex gap-1 overflow-x-auto hide-scrollbar mobile-scroll-container">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-all relative whitespace-nowrap flex-shrink-0',
                  'hover:text-foreground no-tap-highlight mobile-touch-target',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
