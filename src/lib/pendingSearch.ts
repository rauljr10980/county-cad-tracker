const KEY_PREFIX = 'pendingSearch:'

/** Event name dispatched by dispatchPendingSearch; listen for this to react
 *  to a pending search without waiting for a remount. */
export const PENDING_SEARCH_EVENT = 'pending-search'

export interface PendingSearchEventDetail {
  tab: string
  query: string
}

export function setPendingSearch(tab: string, query: string): void {
  sessionStorage.setItem(`${KEY_PREFIX}${tab}`, query)
}

/** Reads and clears in one call — a pending search is consumed at most once. */
export function consumePendingSearch(tab: string): string | null {
  const key = `${KEY_PREFIX}${tab}`
  const value = sessionStorage.getItem(key)
  if (value !== null) sessionStorage.removeItem(key)
  return value
}

/**
 * Announces a pending search to whichever view is currently mounted, in
 * addition to the sessionStorage write from setPendingSearch. A view is only
 * re-seeded from sessionStorage when it mounts (see consumePendingSearch) —
 * if `tab` is already the active/mounted view, nothing remounts to pick that
 * write up. Consumers should listen for this event (filtered to their own
 * tab id) and, on match, apply `detail.query` directly AND call
 * consumePendingSearch(tab) to clear the sessionStorage entry it just wrote
 * (already applied via the event, so it must not surprise a later mount).
 */
export function dispatchPendingSearch(tab: string, query: string): void {
  window.dispatchEvent(
    new CustomEvent<PendingSearchEventDetail>(PENDING_SEARCH_EVENT, { detail: { tab, query } })
  )
}
