/**
 * Shared formatting helpers for the Evictions CRM workspace (src/crm-evictions/**).
 *
 * Not shared with the Eviction List tab (src/crm/views/EvictionLeadsView.tsx) —
 * that view is a deliberately separate visual language and keeps its own copy.
 */

export const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString() : '—');
