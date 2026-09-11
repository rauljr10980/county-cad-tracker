import { LayoutDashboard, CalendarDays, List, Home, Car, Gavel, Briefcase, Building2, Inbox, Globe } from 'lucide-react';

export type TabType =
  | 'dashboard' | 'calendar' | 'properties' | 'tasks' | 'upload'
  | 'files' | 'preforeclosure' | 'driving' | 'crm' | 'evictions' | 'mls' | 'inbox';

export const tabs = [
  { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Dash' },
  { id: 'calendar' as TabType, label: 'Calendar', icon: CalendarDays, shortLabel: 'Cal' },
  { id: 'properties' as TabType, label: 'Properties', icon: List, shortLabel: 'Props' },
  { id: 'preforeclosure' as TabType, label: 'Pre-Foreclosure', icon: Home, shortLabel: 'Pre-FC' },
  { id: 'crm' as TabType, label: 'CRM', icon: Briefcase, shortLabel: 'CRM' },
  { id: 'driving' as TabType, label: 'Driving 4$', icon: Car, shortLabel: 'D4$' },
  { id: 'evictions' as TabType, label: 'Eviction List', icon: Gavel, shortLabel: 'Evict' },
  { id: 'mls' as TabType, label: 'Custom MLS Leads', icon: Building2, shortLabel: 'MLS' },
  { id: 'inbox' as TabType, label: 'Inbox', icon: Inbox, shortLabel: 'Inbox' },
];

export const PUBLIC_SITE_URL = 'https://estate-essentials-co.lovable.app';
export const PUBLIC_SITE_TAB_ID = 'publicSite';

/**
 * Opens an external URL in a new tab rather than switching activeTab. Kept
 * out of `tabs` (typed to TabType, which Index.tsx's renderContent switches
 * on) since it isn't an internal view — NavRail renders it as its own case.
 */
export const externalNavItem = {
  id: PUBLIC_SITE_TAB_ID,
  label: 'Public Website',
  icon: Globe,
  shortLabel: 'Site',
  href: PUBLIC_SITE_URL,
};

/** Every id the manager view can toggle: internal tabs plus the public site link. */
export const manageableNavItems = [...tabs, externalNavItem];

/**
 * Hiding only removes the visual entry point — a hidden tab still renders
 * when reached by hash (e.g. #properties), so bookmarks and links keep
 * working. `hiddenTabIds` comes from GET /api/settings/hidden-tabs, an
 * account-wide setting an ADMIN controls for the whole team (see
 * ManageTabsDialog) — it is no longer a hardcoded constant here.
 */
export function getVisibleTabs(hiddenTabIds: ReadonlySet<string>) {
  return tabs.filter((tab) => !hiddenTabIds.has(tab.id));
}

export function isPublicSiteVisible(hiddenTabIds: ReadonlySet<string>) {
  return !hiddenTabIds.has(PUBLIC_SITE_TAB_ID);
}
