import { cn } from '@/lib/utils';
import { LayoutDashboard, List, Upload, FileText, CheckSquare, Home } from 'lucide-react';

export type TabType = 'dashboard' | 'properties' | 'preforeclosures' | 'tasks' | 'upload' | 'files';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'properties' as TabType, label: 'Properties', icon: List },
  { id: 'tasks' as TabType, label: 'Tasks', icon: CheckSquare },
  { id: 'upload' as TabType, label: 'Upload', icon: Upload },
  { id: 'files' as TabType, label: 'Files', icon: FileText },
  { id: 'preforeclosures' as TabType, label: 'Pre-Foreclosures', icon: Home },
];

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="border-b border-border bg-card/30">
      <div className="container mx-auto px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative',
                  'hover:text-foreground',
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
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
