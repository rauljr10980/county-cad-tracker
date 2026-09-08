import { describe, expect, it } from 'vitest';
import { SCAN_FIELDS, parseScanCorrection } from './scanCorrections.js';

const payload = () => ({ rawOcrText: 'Raul CBRE', fields: SCAN_FIELDS.map(fieldName => ({ fieldName, predictedValue: '', finalValue: '' })) });
describe('scan correction validation', () => {
  it('constructs a nested write and excludes client ownership and unrelated data', () => {
    const result = parseScanCorrection({ ...payload(), userId: 'other', image: 'image' });
    expect(Object.keys(result)).toEqual(['rawOcrText', 'fields']);
    expect(result.fields.create).toHaveLength(12);
  });
  it('rejects missing, duplicate, unknown, non-string and oversized data', () => {
    expect(parseScanCorrection(null)).toBeNull();
    expect(parseScanCorrection({ ...payload(), rawOcrText: ' ' })).toBeNull();
    expect(parseScanCorrection({ ...payload(), rawOcrText: 'x'.repeat(50001) })).toBeNull();
    expect(parseScanCorrection({ ...payload(), fields: [] })).toBeNull();
    for (const patch of [{ fieldName: 'image' }, { fieldName: 'firm' }, { finalValue: {} }, { predictedValue: 'x'.repeat(5001) }]) {
      const body = payload();
      Object.assign(body.fields[0], patch);
      expect(parseScanCorrection(body)).toBeNull();
    }
  });
});
