const SCAN_FIELDS = [
  'ownerName', 'firm', 'jobTitleIndustry', 'phone', 'secondaryPhone', 'email',
  'website', 'streetAddress', 'city', 'state', 'zip', 'linkedIn',
];

// Explicit allowlist prevents retaining unrelated form data or image payloads.
function parseScanCorrection(body) {
  if (!body || typeof body.rawOcrText !== 'string' || !body.rawOcrText.trim()
      || body.rawOcrText.length > 50000 || !Array.isArray(body.fields)
      || body.fields.length !== SCAN_FIELDS.length) return null;
  const names = new Set();
  const fields = [];
  for (const field of body.fields) {
    if (!field || !SCAN_FIELDS.includes(field.fieldName) || names.has(field.fieldName)
        || typeof field.predictedValue !== 'string' || field.predictedValue.length > 5000
        || typeof field.finalValue !== 'string' || field.finalValue.length > 5000) return null;
    names.add(field.fieldName);
    fields.push({ fieldName: field.fieldName, predictedValue: field.predictedValue, finalValue: field.finalValue });
  }
  return { rawOcrText: body.rawOcrText, fields: { create: fields } };
}

module.exports = { SCAN_FIELDS, parseScanCorrection };
