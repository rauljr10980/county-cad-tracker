import { describe, it, expect } from 'vitest';
import { buildTeammateContactsEmail, hasTeammateContacts } from './teammateContacts';

describe('hasTeammateContacts', () => {
  it('is false when every row is blank', () => {
    expect(hasTeammateContacts(
      [{ name: '', phones: [{ number: '' }] }],
      [{ name: '', emails: [''] }],
    )).toBe(false);
  });

  it('is true when a phone row has a name', () => {
    expect(hasTeammateContacts([{ name: 'Ruth', phones: [{ number: '' }] }], [])).toBe(true);
  });

  it('is true when an email row has an address', () => {
    expect(hasTeammateContacts([], [{ name: '', emails: ['a@b.com'] }])).toBe(true);
  });
});

describe('buildTeammateContactsEmail', () => {
  const phoneContacts = [
    { name: 'Ruth Rodriguez', phones: [{ number: '(210) 393-1234' }, { number: '(210) 257-5954' }] },
    { name: '', phones: [{ number: '' }] },
  ];
  const emailRecipients = [
    { name: 'Ruth Rodriguez', emails: ['rurodr@hotmail.com', 'tmg1621@hotmail.com'] },
    { name: '', emails: [''] },
  ];

  it('includes the property address in the subject and body when given', () => {
    const { subject, body } = buildTeammateContactsEmail(phoneContacts, emailRecipients, '123 Main St');
    expect(subject).toBe('Contacts for 123 Main St');
    expect(body).toContain('Contact info for 123 Main St:');
  });

  it('falls back to a generic subject and body when no address is given', () => {
    const { subject, body } = buildTeammateContactsEmail(phoneContacts, emailRecipients);
    expect(subject).toBe('Contacts');
    expect(body).toContain('Contact info:');
  });

  it('lists named phone rows with their numbers joined by commas', () => {
    const { body } = buildTeammateContactsEmail(phoneContacts, [], '123 Main St');
    expect(body).toContain('Phone Numbers:\n1. Ruth Rodriguez — (210) 393-1234, (210) 257-5954');
  });

  it('lists named email rows with their addresses joined by commas', () => {
    const { body } = buildTeammateContactsEmail([], emailRecipients, '123 Main St');
    expect(body).toContain('Emails:\n1. Ruth Rodriguez — rurodr@hotmail.com, tmg1621@hotmail.com');
  });

  it('drops blank rows entirely rather than listing them as empty', () => {
    const { body } = buildTeammateContactsEmail(phoneContacts, emailRecipients, '123 Main St');
    expect(body).not.toContain('2.');
  });

  it('omits the Phone Numbers section when there are no named phone rows', () => {
    const { body } = buildTeammateContactsEmail([], emailRecipients, '123 Main St');
    expect(body).not.toContain('Phone Numbers:');
  });

  it('omits the Emails section when there are no named email rows', () => {
    const { body } = buildTeammateContactsEmail(phoneContacts, [], '123 Main St');
    expect(body).not.toContain('Emails:');
  });

  it('labels a named row with no actual numbers as having none, rather than dropping it', () => {
    const { body } = buildTeammateContactsEmail(
      [{ name: 'Ruth Rodriguez', phones: [{ number: '' }] }],
      [],
      '123 Main St',
    );
    expect(body).toContain('1. Ruth Rodriguez — no phone number');
  });
});
