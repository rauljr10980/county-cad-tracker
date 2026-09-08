import { parseBusinessCard } from './businessCardParser'

// Require a readable identity and repeat agreement on identity + contact data.
// This is a conservative trigger, not a claim that OCR values are correct.
export function scanIdentity(text: string): string | null {
  const card = parseBusinessCard(text)
  if (!card.firstName || (!card.email && !card.phone)) return null
  return JSON.stringify([
    card.firstName.toLocaleLowerCase(), card.lastName.toLocaleLowerCase(),
    card.email.toLocaleLowerCase(), card.phone.replace(/\D/g, ''),
  ])
}
