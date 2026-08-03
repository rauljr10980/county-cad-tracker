/**
 * Shared error banner for the Evictions CRM workspace (src/crm-evictions/**).
 *
 * Not shared with the Eviction List tab (src/crm/views/EvictionLeadsView.tsx) —
 * that view is a deliberately separate visual language and keeps its own markup.
 */

export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div className={`rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive${className ? ` ${className}` : ''}`}>
      {message}
    </div>
  );
}
