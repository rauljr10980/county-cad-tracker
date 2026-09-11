export interface CalendarExportEvent {
  title: string
  start: Date
  end: Date
  description?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

// UTC 'YYYYMMDDTHHMMSSZ' — the wire format both ICS and Google Calendar's
// quick-add URL expect for a timed event.
const toUtcStamp = (date: Date): string =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`

// ICS text fields escape backslash, semicolon, comma, and newline — in that
// order, so escaping a semicolon doesn't get re-escaped by the backslash rule.
const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

/**
 * A minimal single-event .ics file. Apple Calendar (macOS/iOS, and so
 * iCloud) opens one directly on download; Google Calendar also accepts one
 * via its own Import screen, but buildGoogleCalendarUrl below is the
 * one-click path for that specific provider.
 */
export function buildIcsContent(event: CalendarExportEvent): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@county-cad-tracker`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//County CAD Tracker//Calendar Export//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(event.start)}`,
    `DTEND:${toUtcStamp(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

/** Google Calendar's "quick add" URL — opens a prefilled event ready to save, no file download. */
export function buildGoogleCalendarUrl(event: CalendarExportEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcStamp(event.start)}/${toUtcStamp(event.end)}`,
  })
  if (event.description) params.set('details', event.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
