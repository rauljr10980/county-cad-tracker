import { describe, it, expect } from 'vitest';
import { ownerRoleLabels } from './MlsLeadsView';

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
