import { describe, it, expect } from 'vitest';
import { classifyOwner, searchName } from './mlsOwner.js';

describe('classifyOwner', () => {
  it('recognises a person', () => {
    expect(classifyOwner('Baugher Jason E')).toBe('person');
    expect(classifyOwner('Harrison Phillip L')).toBe('person');
  });

  it('recognises an entity by its suffix', () => {
    expect(classifyOwner('Baabco Properties II LLC')).toBe('entity');
    expect(classifyOwner('Romana Property LLC')).toBe('entity');
    expect(classifyOwner('Redbud Lane New Braunfels LLC')).toBe('entity');
  });

  it('recognises agent instructions as junk', () => {
    expect(classifyOwner('See Offer Instructions')).toBe('junk');
    expect(classifyOwner('see agent')).toBe('junk');
    expect(classifyOwner('See Broker')).toBe('junk');
    expect(classifyOwner('private owner (LREA)')).toBe('junk');
    expect(classifyOwner('yep')).toBe('junk');
    expect(classifyOwner('N/A')).toBe('junk');
  });

  it('recognises an address in the owner field', () => {
    expect(classifyOwner('804 Station Street')).toBe('addressLike');
  });

  it('treats junk as junk even when it contains digits', () => {
    expect(classifyOwner('See 123 Main')).toBe('junk');
  });

  it('recognises blank and near-blank', () => {
    expect(classifyOwner('')).toBe('blank');
    expect(classifyOwner('   ')).toBe('blank');
    expect(classifyOwner(null)).toBe('blank');
    expect(classifyOwner(undefined)).toBe('blank');
    expect(classifyOwner('x')).toBe('blank');
  });
});

describe('searchName', () => {
  it('flips a surname-first individual name', () => {
    expect(searchName('Baugher Jason E')).toBe('Jason Baugher');
    expect(searchName('Harrison Phillip L')).toBe('Phillip Harrison');
  });

  it('flips a two-token name', () => {
    expect(searchName('Martinez Petra')).toBe('Petra Martinez');
  });

  it('handles a comma-separated surname-first name', () => {
    expect(searchName('MARTINEZ, PETRA')).toBe('PETRA MARTINEZ');
  });

  it('leaves an entity name alone', () => {
    expect(searchName('Baabco Properties II LLC')).toBe('Baabco Properties II LLC');
  });

  it('leaves a single token alone', () => {
    expect(searchName('Cher')).toBe('Cher');
  });

  it('returns an empty string for junk rather than inventing a name', () => {
    expect(searchName('See Offer Instructions')).toBe('');
    expect(searchName('')).toBe('');
  });
});
