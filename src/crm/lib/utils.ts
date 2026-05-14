import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Lead } from '../data/types'
import { metPersonallyForRating } from './connectionRating'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / 86400000,
  )
  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`
  if (dayDiff < 0 && dayDiff > -7) return `in ${Math.abs(dayDiff)} days`
  return then.toLocaleDateString()
}

const csvField = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function leadsToCsv(leads: Lead[]): string {
  const columns: Array<[string, (lead: Lead) => unknown]> = [
    ['JOB TITLE/INDUSTRY', (lead) => lead.jobTitleIndustry],
    ['Name', (lead) => lead.ownerName],
    ['City', (lead) => lead.city],
    ['Firm', (lead) => lead.firm],
    ['Email', (lead) => lead.email],
    ['Phone', (lead) => lead.phone],
    ['Asset', (lead) => lead.asset],
    ['Specialization', (lead) => lead.specialization],
    ['Updated Notes', (lead) => lead.lastConversationNotes],
    [
      'Met personally',
      (lead) => metPersonallyForRating(lead.connectionRating) || lead.metPersonally,
    ],
  ]
  const rows = leads.map((lead) => columns.map(([, value]) => csvField(value(lead))).join(','))
  return [columns.map(([header]) => csvField(header)).join(','), ...rows].join('\n')
}
