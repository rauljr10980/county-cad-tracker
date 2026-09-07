/**
 * Shared email/phone detection used by both the live scanner's "is a card
 * here yet" trigger (BusinessCardScanner.tsx) and the full field parser
 * (businessCardParser.ts) — one definition instead of two regexes that
 * could quietly drift apart.
 */

export const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
export const PHONE_PATTERN = /(\+?\d[\d\s().-]{8,}\d)/

export const hasContactSignal = (text: string): boolean =>
  EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)
