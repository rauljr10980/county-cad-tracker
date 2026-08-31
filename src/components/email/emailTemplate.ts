/**
 * Pure helpers behind the Send Email panel's {{Variable}} substitution and
 * recipient seeding. Kept free of JSX/React so they're trivial to unit test
 * (see emailTemplate.test.ts) and reusable by any screen that renders
 * SendEmailPanel.
 */

export type EmailRecipient = {
  name: string;
  emails: string[];
  /** Per-email notes, parallel to `emails` (index i is the note for emails[i]).
   *  Only rendered/used when SendEmailPanel is given `showNotes`. */
  emailNotes?: string[];
  sent?: boolean;
};

/**
 * Derives {{LastName}} exactly the way the original inline Send Email panel
 * did: the last whitespace-separated token of the recipient's name, falling
 * back to the full (trimmed) name, then to 'there' when there's nothing to
 * work with (e.g. an empty name).
 */
export function resolveLastName(fullNameRaw: string): string {
  const fullName = fullNameRaw.trim();
  return fullName.split(/\s+/).pop() || fullName || 'there';
}

export type SubstitutionVars = {
  lastName: string;
  name: string;
  propertyAddress: string;
  owner: string;
  phoneNumber: string;
};

/** Builds the substitution vars for a single recipient's typed name. */
export function recipientVars(
  fullNameRaw: string,
  propertyAddress: string,
  owner: string,
  phoneNumber: string,
): SubstitutionVars {
  const fullName = fullNameRaw.trim();
  return {
    lastName: resolveLastName(fullName),
    name: fullName || 'there',
    propertyAddress,
    owner,
    phoneNumber,
  };
}

export function substituteBody(body: string, vars: SubstitutionVars): string {
  return body
    .replace(/\{\{LastName\}\}/g, vars.lastName)
    .replace(/\{\{Name\}\}/g, vars.name)
    .replace(/\{\{PropertyAddress\}\}/g, vars.propertyAddress)
    .replace(/\{\{Owner\}\}/g, vars.owner)
    .replace(/\{\{PhoneNumber\}\}/g, vars.phoneNumber);
}

export function substituteSubject(
  subject: string,
  vars: Pick<SubstitutionVars, 'propertyAddress' | 'owner'>,
): string {
  return subject
    .replace(/\{\{PropertyAddress\}\}/g, vars.propertyAddress)
    .replace(/\{\{Owner\}\}/g, vars.owner);
}

export type SeedEmailRow = { name: string; emails: { address: string; note?: string }[] };

/**
 * Seeds SendEmailPanel recipients from an eviction landlord's existing
 * emailRows, one recipient per row (not one per address, and not padded to
 * a fixed number of blank rows). Each email's note travels alongside it in
 * `emailNotes` so a multi-email row keeps its notes lined up by index.
 */
export function recipientsFromEmailRows(rows: SeedEmailRow[]): EmailRecipient[] {
  return rows.map((row) => ({
    name: row.name,
    emails: row.emails.map((e) => e.address),
    emailNotes: row.emails.map((e) => e.note || ''),
  }));
}
