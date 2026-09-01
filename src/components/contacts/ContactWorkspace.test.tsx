import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactWorkspace } from './ContactWorkspace';
import type { NormalizedContacts } from '@/lib/contactsModel';

const empty: NormalizedContacts = { phoneRows: [], emailRows: [] };

const truePeopleSearchPaste = 'John Smith\n\n(210) 555-1234\n\njohn@example.com';

describe('ContactWorkspace', () => {
  it('extracts phone and email rows from a TruePeopleSearch paste and saves them', async () => {
    const onContactsChange = vi.fn();
    render(
      <ContactWorkspace
        contacts={empty}
        onContactsChange={onContactsChange}
        ownerName="Jane Doe"
        propertyAddress="123 Main St"
        owner="Jane Doe"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Paste all text from TruePeopleSearch/), {
      target: { value: truePeopleSearchPaste },
    });
    fireEvent.click(screen.getByText('Extract and save'));

    await waitFor(() => expect(onContactsChange).toHaveBeenCalledTimes(1));
    const next = onContactsChange.mock.calls[0][0] as NormalizedContacts;
    expect(next.phoneRows).toHaveLength(1);
    expect(next.phoneRows[0].phones[0].number).toBe('(210) 555-1234');
    expect(next.emailRows).toHaveLength(1);
    expect(next.emailRows[0].emails[0].address).toBe('john@example.com');
  });

  it('preserves an existing note on extraction, since a new row is appended rather than replacing what is there', async () => {
    const onContactsChange = vi.fn();
    const existing: NormalizedContacts = {
      phoneRows: [{
        name: 'Existing Contact',
        phones: [{ number: '(555) 000-1111', status: '', attempts: 2, lastAttemptAt: null, note: 'left voicemail' }],
      }],
      emailRows: [],
    };
    render(
      <ContactWorkspace
        contacts={existing}
        onContactsChange={onContactsChange}
        ownerName="Jane Doe"
        propertyAddress="123 Main St"
        owner="Jane Doe"
      />
    );

    // The existing note is visible before any extraction happens.
    expect(screen.getByPlaceholderText('Note for this number')).toHaveProperty('value', 'left voicemail');

    fireEvent.change(screen.getByPlaceholderText(/Paste all text from TruePeopleSearch/), {
      target: { value: truePeopleSearchPaste },
    });
    fireEvent.click(screen.getByText('Extract and save'));

    await waitFor(() => expect(onContactsChange).toHaveBeenCalledTimes(1));
    const next = onContactsChange.mock.calls[0][0] as NormalizedContacts;
    expect(next.phoneRows).toHaveLength(2);
    expect(next.phoneRows[0].phones[0].note).toBe('left voicemail');
    expect(next.phoneRows[0].phones[0].number).toBe('(555) 000-1111');
    expect(next.phoneRows[1].phones[0].number).toBe('(210) 555-1234');
  });

  // Pins the freshness guarantee this component owns internally: two edits
  // inside one round trip must compose, not race. Marking a number wrong and
  // then, before the parent has fed a new `contacts` prop back in, typing a
  // note, must produce a second save that carries both changes — not one
  // that reverts to the disposition-less blob still sitting in props.
  it('composes a disposition change and a note without losing either, even before the parent re-renders', async () => {
    const onContactsChange = vi.fn();
    const contacts: NormalizedContacts = {
      phoneRows: [{ name: 'X', phones: [{ number: '(555) 000-1111', status: '', attempts: 0, lastAttemptAt: null }] }],
      emailRows: [],
    };
    render(
      <ContactWorkspace
        contacts={contacts}
        onContactsChange={onContactsChange}
        ownerName="Jane Doe"
        propertyAddress=""
        owner="Jane Doe"
      />
    );

    fireEvent.click(screen.getByText('Wrong number'));
    const noteInput = screen.getByPlaceholderText('Note for this number');
    fireEvent.change(noteInput, { target: { value: 'said wrong number' } });
    fireEvent.blur(noteInput);

    await waitFor(() => expect(onContactsChange).toHaveBeenCalledTimes(2));
    const secondCall = onContactsChange.mock.calls[1][0] as NormalizedContacts;
    expect(secondCall.phoneRows[0].phones[0].status).toBe('wrong');
    expect(secondCall.phoneRows[0].phones[0].note).toBe('said wrong number');
  });
});
