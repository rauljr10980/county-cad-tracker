/**
 * Single source of truth for the eviction pipeline vocabulary.
 *
 * Both the Evictions CRM and the Eviction List tab import from here. They write
 * the same `contactStage` column on the same row, so the lists cannot be allowed
 * to drift.
 */

export const STAGES = [
  'New Lead',
  'Researching',
  'Ready to Contact',
  'Attempted Contact',
  'Contacted',
  'Follow-Up',
  'Appointment Scheduled',
  'Interested',
  'Not Interested',
  'Under Contract',
  'Closed',
  'Do Not Contact',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Pre-migration values, kept so the frontend renders correctly if it meets a row
 * the migration has not reached yet. Unknown values pass through untouched so bad
 * data is visible rather than silently folded into a real stage.
 */
const LEGACY_STAGES: Record<string, Stage> = {
  New: 'New Lead',
  'Follow Up': 'Follow-Up',
  Qualified: 'Interested',
  'Do Not Call': 'Do Not Contact',
};

export const mapLegacyStage = (value: string): string => LEGACY_STAGES[value] ?? value;

/** Tailwind classes per stage, used by pipeline cards and stage badges. */
export const STAGE_TONE: Record<Stage, string> = {
  'New Lead': 'bg-muted text-muted-foreground',
  Researching: 'bg-warning/15 text-warning',
  'Ready to Contact': 'bg-primary/15 text-primary',
  'Attempted Contact': 'bg-primary/15 text-primary',
  Contacted: 'bg-primary/20 text-primary',
  'Follow-Up': 'bg-warning/15 text-warning',
  'Appointment Scheduled': 'bg-accent/20 text-accent',
  Interested: 'bg-success/15 text-success',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Under Contract': 'bg-success/20 text-success',
  Closed: 'bg-success/25 text-success',
  'Do Not Contact': 'bg-destructive/15 text-destructive',
};

export const SERVICE_INTERESTS = [
  'Undecided',
  'Acquisition / Sell to Us',
  'Listing',
  'Property Management',
] as const;
