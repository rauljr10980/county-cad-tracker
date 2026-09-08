/**
 * Turns the raw text a live-scanned business card produces (see
 * BusinessCardScanner.tsx) into structured contact fields. Regex and
 * ordered heuristics, not an LLM or cloud call — this stays entirely
 * client-side, matching the design's zero-network decision.
 *
 * Each rule below claims a line and removes it from consideration by
 * later rules, applied in an order chosen so a more specific rule always
 * runs before a more general one that could misfire on the same line.
 *
 * None of this will be perfect on an unusual card — Tesseract.js itself
 * is less accurate than a cloud OCR service, which this design accepted
 * in exchange for zero network calls and zero ongoing cost. The review
 * screen this feeds is where a wrong guess gets corrected.
 */

import { EMAIL_PATTERN, PHONE_PATTERN } from './businessCardText'

// Hand-copied from functions/src/lib/mlsOwner.js's ENTITY constant — that
// file is backend-only (Node/CommonJS) and this parser runs entirely in
// the browser (Vite/ESM), so it can't be imported directly across that
// boundary. Keep the two in sync by hand if either changes.
const ENTITY =
  /\b(LLC|L\.L\.C|LCC|PLLC|LP|L\.P|LLP|LLLP|INC|TRUST|PROPERTIES|CORP|HOLDINGS|LTD|INVESTMENTS|PARTNERS|COMPANY|GROUP|ENTERPRISES|REALTY|RENTALS|MANAGEMENT|VENTURES|ASSOCIATES|EQUITY|CAPITAL|DEVELOPMENT|HOMES|ESTATES)\b/i

const LINKEDIN_PATTERN = /linkedin\.com\S*/i
const WEBSITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i
const CITY_STATE_ZIP_PATTERN = /^(.*?),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
const STREET_START_PATTERN = /^\d+\s+\S/
const TITLE_WORD_PATTERN = /\b(manager|director|president|partner|owner|ceo|cfo|coo|founder|agent|broker|vp|vice president|associate|principal)\b/i

export type ParsedBusinessCard = {
  firstName: string
  lastName: string
  company: string
  jobTitle: string
  phone: string
  secondaryPhone: string
  email: string
  website: string
  streetAddress: string
  city: string
  state: string
  zip: string
  linkedIn: string
}

const emptyResult = (): ParsedBusinessCard => ({
  firstName: '', lastName: '', company: '', jobTitle: '',
  phone: '', secondaryPhone: '', email: '', website: '',
  streetAddress: '', city: '', state: '', zip: '', linkedIn: '',
})

export const parseBusinessCard = (rawText: string): ParsedBusinessCard => {
  const result = emptyResult()
  const lines = String(rawText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const take = (index: number) => lines.splice(index, 1)

  // PHONE_PATTERN requires its match to start with "+" or a digit, so a
  // parenthesized area code like "(210)" loses its opening paren — put it
  // back when the source line had one immediately before the match. It
  // also can't tell a phone number from a ZIP+4 ("78205-1234" is itself
  // \d + 8 mixed chars + \d), so skip any line that's actually shaped like
  // a city/state/zip line and let rule 6 claim it instead — a more general
  // pattern shouldn't misfire on a line a more specific rule owns.
  const takePhone = (): string => {
    const index = lines.findIndex(
      (line) => PHONE_PATTERN.test(line) && !CITY_STATE_ZIP_PATTERN.test(line),
    )
    if (index === -1) return ''
    const line = lines[index]
    const match = line.match(PHONE_PATTERN)!
    let value = match[0].trim()
    if (match.index! > 0 && line[match.index! - 1] === '(' && !value.startsWith('(')) {
      value = '(' + value
    }
    take(index)
    return value
  }

  // 1. Email — first match wins.
  {
    const index = lines.findIndex((line) => EMAIL_PATTERN.test(line))
    if (index !== -1) {
      result.email = lines[index].match(EMAIL_PATTERN)![0]
      take(index)
    }
  }

  // 2. Phone — first match wins.
  result.phone = takePhone()

  // 3. Secondary phone — a second, different phone-shaped line.
  result.secondaryPhone = takePhone()

  // 4. LinkedIn.
  {
    const index = lines.findIndex((line) => LINKEDIN_PATTERN.test(line))
    if (index !== -1) {
      result.linkedIn = lines[index].match(LINKEDIN_PATTERN)![0]
      take(index)
    }
  }

  // 5. Website — not the email/LinkedIn line, which are already removed.
  {
    const index = lines.findIndex((line) => WEBSITE_PATTERN.test(line) && !line.includes('@'))
    if (index !== -1) {
      result.website = lines[index].match(WEBSITE_PATTERN)![0]
      take(index)
    }
  }

  // 6. City/State/ZIP, with an optional embedded street prefix on the same line.
  {
    const index = lines.findIndex((line) => CITY_STATE_ZIP_PATTERN.test(line))
    if (index !== -1) {
      const match = lines[index].match(CITY_STATE_ZIP_PATTERN)!
      let cityPart = match[1]
      result.state = match[2]
      result.zip = match[3]
      const commaIndex = cityPart.indexOf(',')
      if (commaIndex !== -1 && STREET_START_PATTERN.test(cityPart.slice(0, commaIndex).trim())) {
        result.streetAddress = cityPart.slice(0, commaIndex).trim()
        cityPart = cityPart.slice(commaIndex + 1)
      }
      result.city = cityPart.trim()
      take(index)
    }
  }

  // 7. Street address — a separate line, if not already captured by rule 6.
  if (!result.streetAddress) {
    const index = lines.findIndex((line) => STREET_START_PATTERN.test(line))
    if (index !== -1) {
      result.streetAddress = lines[index]
      take(index)
    }
  }

  // 8. Company — a legal-entity suffix.
  {
    const index = lines.findIndex((line) => ENTITY.test(line))
    if (index !== -1) {
      result.company = lines[index]
      take(index)
    }
  }

  // 9. Job title — a role word.
  {
    const index = lines.findIndex((line) => TITLE_WORD_PATTERN.test(line))
    if (index !== -1) {
      result.jobTitle = lines[index]
      take(index)
    }
  }

  // Ignore OCR noise rather than promoting arbitrary leftover text to a name.
  // Unicode letters, initials, apostrophes and hyphens support real names.
  const name = lines.find((line) => {
    const parts = line.split(/\s+/)
    return parts.length <= 6 && parts.every(part => /^[\p{L}\p{M}]+(?:['’.-][\p{L}\p{M}]+)*\.?$/u.test(part))
      && parts.some(part => (part.match(/\p{L}/gu)?.length ?? 0) >= 2)
  })
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    result.firstName = parts[0] ?? ''
    result.lastName = parts.slice(1).join(' ')
  }

  return result
}
