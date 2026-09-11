import { cn } from '@/lib/utils';
import { externalNavItem, getVisibleTabs, isPublicSiteVisible, type TabType } from './navItems';

const itemClasses = (isActive: boolean) =>
  cn(
    'flex w-full flex-col items-center gap-1 rounded px-1 py-2.5 transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    isActive ? 'text-white' : 'text-white/60 hover:text-white'
  );

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
  hiddenTabIds,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  /**
   * Account-wide, ADMIN-controlled tab visibility (see ManageTabsDialog).
   * Defaults to hiding nothing — Index.tsx seeds a sensible default while
   * GET /api/settings/hidden-tabs is loading.
   */
  hiddenTabIds?: ReadonlySet<string>;
}) {
  const hidden = hiddenTabIds ?? new Set<string>();
  const visibleTabs = getVisibleTabs(hidden);

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
                className={itemClasses(isActive)}
                style={isActive ? { backgroundColor: 'hsl(var(--navy-mid))' } : undefined}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span aria-hidden="true" className="label text-[9px] leading-tight text-current">{tab.shortLabel}</span>
                <span className="sr-only">{tab.label}</span>
              </button>
            </li>
          );
        })}
        {isPublicSiteVisible(hidden) && (
          <li>
            <a
              href={externalNavItem.href}
              target="_blank"
              rel="noopener noreferrer"
              title={externalNavItem.label}
              className={itemClasses(false)}
            >
              <externalNavItem.icon className="h-[18px] w-[18px]" />
              <span aria-hidden="true" className="label text-[9px] leading-tight text-current">{externalNavItem.shortLabel}</span>
              <span className="sr-only">{externalNavItem.label} (opens in a new tab)</span>
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
