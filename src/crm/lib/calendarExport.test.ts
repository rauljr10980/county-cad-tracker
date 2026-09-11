import { describe, it, expect } from 'vitest'
import { buildIcsContent, buildGoogleCalendarUrl } from './calendarExport'

const event = {
  title: 'Call John Smith',
  start: new Date('2026-09-15T14:30:00.000Z'),
  end: new Date('2026-09-15T15:00:00.000Z'),
  description: 'Follow up on offer',
}

describe('buildIcsContent', () => {
  it('includes the summary, start, and end in UTC basic format', () => {
    const ics = buildIcsContent(event)
    expect(ics).toContain('SUMMARY:Call John Smith')
    expect(ics).toContain('DTSTART:20260915T143000Z')
    expect(ics).toContain('DTEND:20260915T150000Z')
  })

  it('includes the description when given, and omits it when absent', () => {
    expect(buildIcsContent(event)).toContain('DESCRIPTION:Follow up on offer')
    expect(buildIcsContent({ ...event, description: undefined })).not.toContain('DESCRIPTION:')
  })

  it('escapes commas, semicolons, and newlines in text fields', () => {
    const ics = buildIcsContent({ ...event, title: 'Meet; discuss, terms\nbring docs' })
    expect(ics).toContain('SUMMARY:Meet\\; discuss\\, terms\\nbring docs')
  })

  it('is a well-formed VCALENDAR/VEVENT block', () => {
    const ics = buildIcsContent(event)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })
})

describe('buildGoogleCalendarUrl', () => {
  it('builds a quick-add URL with the title and UTC date range', () => {
    const url = buildGoogleCalendarUrl(event)
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('action')).toBe('TEMPLATE')
    expect(params.get('text')).toBe('Call John Smith')
    expect(params.get('dates')).toBe('20260915T143000Z/20260915T150000Z')
    expect(params.get('details')).toBe('Follow up on offer')
  })

  it('omits the details param when there is no description', () => {
    const url = buildGoogleCalendarUrl({ ...event, description: undefined })
    expect(new URL(url).searchParams.has('details')).toBe(false)
  })
})
