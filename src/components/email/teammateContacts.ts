/**
 * Pure formatting behind "Send to Teammate" — turns the Phone Numbers and
 * Send Email panels' current rows into one plain-text summary. Kept free of
 * JSX/React so it's trivial to unit test, matching emailTemplate.ts's split.
 */

export type TeammatePhoneRow = { name: string; phones: { number: string }[] };
export type TeammateEmailRow = { name: string; emails: string[] };

const hasContent = (name: string, values: string[]): boolean =>
  Boolean(name.trim()) || values.some((v) => v.trim());

/** True when there's at least one named-or-populated row in either list. */
export function hasTeammateContacts(
  phoneContacts: TeammatePhoneRow[],
  emailRecipients: TeammateEmailRow[],
): boolean {
  return (
    phoneContacts.some((row) => hasContent(row.name, row.phones.map((p) => p.number))) ||
    emailRecipients.some((row) => hasContent(row.name, row.emails))
  );
}

export function buildTeammateContactsEmail(
  phoneContacts: TeammatePhoneRow[],
  emailRecipients: TeammateEmailRow[],
  propertyAddress?: string,
): { subject: string; body: string } {
  const subject = propertyAddress?.trim()
    ? `Contacts for ${propertyAddress.trim()}`
    : 'Contacts';

  const phoneLines = phoneContacts
    .filter((row) => hasContent(row.name, row.phones.map((p) => p.number)))
    .map((row, index) => {
      const numbers = row.phones.map((p) => p.number.trim()).filter(Boolean);
      const label = row.name.trim() || `Contact ${index + 1}`;
      return `${index + 1}. ${label} — ${numbers.length ? numbers.join(', ') : 'no phone number'}`;
    });

  const emailLines = emailRecipients
    .filter((row) => hasContent(row.name, row.emails))
    .map((row, index) => {
      const addresses = row.emails.map((e) => e.trim()).filter(Boolean);
      const label = row.name.trim() || `Contact ${index + 1}`;
      return `${index + 1}. ${label} — ${addresses.length ? addresses.join(', ') : 'no email address'}`;
    });

  const sections = [
    propertyAddress?.trim() ? `Contact info for ${propertyAddress.trim()}:` : 'Contact info:',
    phoneLines.length ? `Phone Numbers:\n${phoneLines.join('\n')}` : '',
    emailLines.length ? `Emails:\n${emailLines.join('\n')}` : '',
  ].filter(Boolean);

  return { subject, body: sections.join('\n\n') };
}
