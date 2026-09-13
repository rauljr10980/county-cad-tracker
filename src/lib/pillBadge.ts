// Shared pill-badge styling for CRM tables (Eviction Leads, MLS Leads,
// Contacts). Layout stays fixed; the tone controls background/text. Extracted
// from EvictionLeadsView.tsx and MlsLeadsView.tsx, which each independently
// defined an identical copy of this.
export type PillTone = 'grey' | 'blue' | 'warn' | 'danger' | 'success';

const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';

const PILL_TONE_CLASSES: Record<string, string> = {
  '': 'bg-muted text-muted-foreground',
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-success/15 text-success',
};

export const pillClass = (tone: string): string =>
  `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;
