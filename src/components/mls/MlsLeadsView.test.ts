import { describe, it, expect } from 'vitest';
import { isSkipTraceable, isTraced, ownerRoleLabels } from './MlsLeadsView';

describe('isSkipTraceable', () => {
  it('excludes junk, addressLike, and blank nameKinds', () => {
    expect(isSkipTraceable('junk')).toBe(false);
    expect(isSkipTraceable('addressLike')).toBe(false);
    expect(isSkipTraceable('blank')).toBe(false);
  });

  it('includes person and entity nameKinds', () => {
    expect(isSkipTraceable('person')).toBe(true);
    expect(isSkipTraceable('entity')).toBe(true);
  });
});

describe('isTraced', () => {
  it('is false for a contact with no phones or emails', () => {
    expect(isTraced({ contacts: { phoneRows: [], emailRows: [] } })).toBe(false);
  });

  it('is false for a contacts blob whose rows are present but empty', () => {
    expect(isTraced({ contacts: { phoneRows: [{ name: 'x', phones: [] }], emailRows: [] } })).toBe(false);
  });

  it('is true once a phone number or email has been extracted', () => {
    expect(isTraced({ contacts: { phoneRows: [{ name: 'x', phones: [{ number: '210-555-0100' }] }], emailRows: [] } })).toBe(true);
    expect(isTraced({ contacts: { phoneRows: [], emailRows: [{ name: 'x', emails: [{ address: 'a@b.com' }] }] } })).toBe(true);
  });

  it('handles a missing/malformed contacts blob the same way normalizeContacts does', () => {
    expect(isTraced({ contacts: null })).toBe(false);
    expect(isTraced({ contacts: undefined })).toBe(false);
  });
});

describe('ownerRoleLabels', () => {
  it('labels a sold row Seller / Buyer', () => {
    expect(ownerRoleLabels('SLD')).toEqual({ primary: 'Seller', secondary: 'Buyer' });
  });

  it('labels an active row Owner / Other party rather than claiming a sale happened', () => {
    expect(ownerRoleLabels('ACT')).toEqual({ primary: 'Owner', secondary: 'Other party' });
  });

  it('labels every other known status Owner / Other party, not Seller / Buyer', () => {
    for (const status of ['PEND', 'EXP', 'WD', 'CS']) {
      expect(ownerRoleLabels(status)).toEqual({ primary: 'Owner', secondary: 'Other party' });
    }
  });

  it('falls back to Owner / Other party for an unrecognised or blank status', () => {
    expect(ownerRoleLabels('')).toEqual({ primary: 'Owner', secondary: 'Other party' });
    expect(ownerRoleLabels('SOMETHING_UNMAPPED')).toEqual({ primary: 'Owner', secondary: 'Other party' });
  });
});
