import type { ConnectionRating } from '@/crm/data/types'

export const RELATIONSHIP_RATING_OPTIONS = [
  'great',
  'workable',
  'low-effort',
] as const satisfies readonly ConnectionRating[]

export const RELATIONSHIP_DROPDOWN_OPTIONS = [
  'none',
  ...RELATIONSHIP_RATING_OPTIONS,
] as const satisfies readonly ConnectionRating[]

export const relationshipRatingMeta: Record<
  ConnectionRating,
  {
    label: string
    tableLabel: string
    metPersonallyLabel: string
    title: string
    dotClass: string
    buttonClass: string
    activeClass: string
    selectClass: string
  }
> = {
  none: {
    label: 'Unrated',
    tableLabel: 'None',
    metPersonallyLabel: '',
    title: 'No relationship status selected',
    dotClass: 'bg-muted-foreground',
    buttonClass: 'border-input text-muted-foreground hover:bg-muted',
    activeClass: 'border-muted-foreground bg-muted text-foreground',
    selectClass: 'border-input text-muted-foreground',
  },
  great: {
    label: 'Great',
    tableLabel: 'Green',
    metPersonallyLabel: 'Green',
    title: 'Great connection',
    dotClass: 'bg-emerald-500',
    buttonClass: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950',
    activeClass: 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-600',
    selectClass: 'border-emerald-500 bg-emerald-600 text-white',
  },
  workable: {
    label: 'Mid',
    tableLabel: 'Yellow',
    metPersonallyLabel: 'Yellow',
    title: 'Mid, but workable',
    dotClass: 'bg-amber-500',
    buttonClass: 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950',
    activeClass: 'border-amber-500 bg-amber-500 text-white hover:bg-amber-500',
    selectClass: 'border-amber-500 bg-amber-500 text-white',
  },
  'low-effort': {
    label: 'Low Effort',
    tableLabel: 'Red',
    metPersonallyLabel: 'Red',
    title: 'Low effort or poor fit',
    dotClass: 'bg-red-500',
    buttonClass: 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950',
    activeClass: 'border-red-500 bg-red-600 text-white hover:bg-red-600',
    selectClass: 'border-red-500 bg-red-600 text-white',
  },
}

export const metPersonallyForRating = (rating: ConnectionRating): string =>
  relationshipRatingMeta[rating].metPersonallyLabel

export const ratingFromMetPersonally = (value: string): ConnectionRating => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'none'

  if (
    normalized.includes('green') ||
    normalized.includes('great') ||
    normalized.includes('strong')
  ) {
    return 'great'
  }

  if (
    normalized.includes('yellow') ||
    normalized.includes('mid') ||
    normalized.includes('workable') ||
    normalized.includes('okay') ||
    normalized.includes('ok')
  ) {
    return 'workable'
  }

  if (
    normalized.includes('red') ||
    normalized.includes('weird') ||
    normalized.includes('low effort') ||
    normalized.includes('low-effort') ||
    normalized.includes('no effort') ||
    normalized.includes('bad')
  ) {
    return 'low-effort'
  }

  return 'none'
}
