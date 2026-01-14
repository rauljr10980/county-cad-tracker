import { cn } from '@/lib/utils';
import { LayoutDashboard, List, Upload, FileText, CheckSquare, Home } from 'lucide-react';

export type TabType = 'dashboard' | 'properties' | 'tasks' | 'upload' | 'files' | 'preforeclosure';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Dash' },
  { id: 'properties' as TabType, label: 'Properties', icon: List, shortLabel: 'Props' },
  { id: 'tasks' as TabType, label: 'Tasks', icon: CheckSquare, shortLabel: 'Tasks' },
  { id: 'preforeclosure' as TabType, label: 'Pre-Foreclosure', icon: Home, shortLabel: 'Pre-FC' },
];

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="border-b border-border bg-card/30 sticky top-[57px] md:top-[61px] z-40">
      <div className="container mx-auto px-2 md:px-4">
        <div className="flex gap-1 overflow-x-auto hide-scrollbar mobile-scroll-container">
          {tabs.map((tab) => {
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
