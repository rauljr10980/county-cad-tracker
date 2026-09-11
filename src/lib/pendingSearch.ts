const KEY_PREFIX = 'pendingSearch:'

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
