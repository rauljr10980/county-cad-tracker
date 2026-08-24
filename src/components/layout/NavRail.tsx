import { cn } from '@/lib/utils';
import { visibleTabs, type TabType } from './navItems';

/**
 * Navy rail against light content.
 *
 * The rail anchors the page and keeps the navigation target fixed while the
 * content scrolls beneath it. Its colours are literal rather than semantic:
 * it sits on navy while the rest of the app sits on paper, so the shared
 * tokens mean the wrong thing here.
 */
export function NavRail({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="flex w-[76px] shrink-0 flex-col items-center py-4"
      style={{ backgroundColor: 'hsl(var(--navy))' }}
    >
      <div className="mb-7 flex flex-col items-center">
        <span className="record text-[15px] font-medium tracking-tight text-white">360</span>
        <span className="mt-1 h-px w-7" style={{ backgroundColor: 'hsl(var(--navy-soft))' }} />
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 w-full px-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded px-1 py-2.5 transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  isActive ? 'text-white' : 'text-white/60 hover:text-white'
                )}
                style={isActive ? { backgroundColor: 'hsl(var(--navy-mid))' } : undefined}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="label text-[9px] leading-tight text-current">{tab.shortLabel}</span>
                <span className="sr-only">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
