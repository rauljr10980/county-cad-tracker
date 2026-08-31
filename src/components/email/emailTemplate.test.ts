import { describe, it, expect } from 'vitest';
import {
  resolveLastName,
  recipientVars,
  substituteBody,
  substituteSubject,
  recipientsFromEmailRows,
} from './emailTemplate';

describe('resolveLastName', () => {
  it('takes the last whitespace-separated token of a full name', () => {
    expect(resolveLastName('John Smith')).toBe('Smith');
  });

  it('handles extra internal whitespace', () => {
    expect(resolveLastName('  Mary   Jane   Watson  ')).toBe('Watson');
  });

  it('falls back to the whole name when it is a single word', () => {
    expect(resolveLastName('Cher')).toBe('Cher');
  });

  it('falls back to "there" for an empty name', () => {
    expect(resolveLastName('')).toBe('there');
  });

  it('falls back to "there" for a whitespace-only name', () => {
    expect(resolveLastName('   ')).toBe('there');
  });
});

describe('recipientVars', () => {
  it('derives lastName and name from a full name', () => {
    const vars = recipientVars('John Smith', '123 Main St', 'Jane Owner', '555-1234');
    expect(vars).toEqual({
      lastName: 'Smith',
      name: 'John Smith',
      propertyAddress: '123 Main St',
      owner: 'Jane Owner',
      phoneNumber: '555-1234',
    });
  });

  it('uses "there" for both name and lastName when the name is empty', () => {
    const vars = recipientVars('', '123 Main St', 'Jane Owner', '');
    expect(vars.name).toBe('there');
    expect(vars.lastName).toBe('there');
  });

  it('uses the single word for both name and lastName for a one-word name', () => {
    const vars = recipientVars('Cher', '123 Main St', 'Jane Owner', '');
    expect(vars.name).toBe('Cher');
    expect(vars.lastName).toBe('Cher');
  });
});

describe('substituteBody', () => {
  const vars = {
    lastName: 'Smith',
    name: 'John Smith',
    propertyAddress: '123 Main St',
    owner: 'Jane Owner',
    phoneNumber: '555-1234',
  };

  it('replaces every supported variable', () => {
    const body =
      'Hi {{LastName}}, this is about {{PropertyAddress}} owned by {{Owner}}. Full name: {{Name}}. Call {{PhoneNumber}}.';
    expect(substituteBody(body, vars)).toBe(
      'Hi Smith, this is about 123 Main St owned by Jane Owner. Full name: John Smith. Call 555-1234.',
    );
  });

  it('replaces every occurrence, not just the first', () => {
    const body = '{{LastName}} {{LastName}}';
    expect(substituteBody(body, vars)).toBe('Smith Smith');
  });

  it('leaves the body unchanged when there are no variables', () => {
    expect(substituteBody('Plain text, no variables.', vars)).toBe('Plain text, no variables.');
  });

  it('supports the "___" placeholder used by Copy Text', () => {
    const placeholderVars = { ...vars, lastName: '___', name: '___' };
    expect(substituteBody('Hi {{LastName}} ({{Name}})', placeholderVars)).toBe('Hi ___ (___)');
  });
});

describe('substituteSubject', () => {
  it('replaces PropertyAddress and Owner only', () => {
    const subject = substituteSubject('Re: {{PropertyAddress}} ({{Owner}})', {
      propertyAddress: '123 Main St',
      owner: 'Jane Owner',
    });
    expect(subject).toBe('Re: 123 Main St (Jane Owner)');
  });

  it('does not touch {{LastName}} or {{Name}}', () => {
    const subject = substituteSubject('{{LastName}} regarding {{PropertyAddress}}', {
      propertyAddress: '123 Main St',
      owner: 'Jane Owner',
    });
    expect(subject).toBe('{{LastName}} regarding 123 Main St');
  });
});

describe('recipientsFromEmailRows', () => {
  it('seeds one recipient per row, not one per address', () => {
    const rows = [
      { name: 'Petra Martinez', emails: [{ address: 'petra1@yahoo.com' }, { address: 'petra2@gmail.com' }] },
      { name: 'Bob Owner', emails: [{ address: 'bob@example.com' }] },
    ];
    const recipients = recipientsFromEmailRows(rows);
    expect(recipients).toHaveLength(2);
    expect(recipients[0]).toEqual({
      name: 'Petra Martinez',
      emails: ['petra1@yahoo.com', 'petra2@gmail.com'],
      emailNotes: ['', ''],
    });
    expect(recipients[1]).toEqual({
      name: 'Bob Owner',
      emails: ['bob@example.com'],
      emailNotes: [''],
    });
  });

  it('carries each address note along at the matching index', () => {
    const rows = [
      {
        name: 'Petra Martinez',
        emails: [{ address: 'petra1@yahoo.com', note: 'bounced' }, { address: 'petra2@gmail.com' }],
      },
    ];
    const recipients = recipientsFromEmailRows(rows);
    expect(recipients[0].emailNotes).toEqual(['bounced', '']);
  });

  it('produces an empty array for a landlord with no email rows, not padded blank rows', () => {
    expect(recipientsFromEmailRows([])).toEqual([]);
  });

  it('keeps a row with no emails as a recipient with an empty emails array', () => {
    const recipients = recipientsFromEmailRows([{ name: 'No Email Guy', emails: [] }]);
    expect(recipients).toEqual([{ name: 'No Email Guy', emails: [], emailNotes: [] }]);
  });
});
