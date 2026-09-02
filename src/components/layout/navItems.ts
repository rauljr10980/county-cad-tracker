import { LayoutDashboard, CalendarDays, List, Home, Car, Gavel, Briefcase, Building2, Inbox } from 'lucide-react';

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

/**
 * Tabs hidden from the nav. Empty means every tab shows.
 *
 * Hiding only removes the visual entry point — a hidden tab still renders when
 * reached by hash (e.g. #properties), so bookmarks and links keep working.
 */
export const HIDDEN_TABS = new Set<TabType>([]);

export const visibleTabs = tabs.filter((tab) => !HIDDEN_TABS.has(tab.id));
