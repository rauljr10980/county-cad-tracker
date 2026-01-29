/**
 * Parse a full US address string into components.
 * Input: "123 Main St, San Antonio, TX 78201"
 * Output: { street: "123 Main St", city: "San Antonio", state: "TX", zip: "78201" }
 */
function parseFullAddress(fullAddress) {
  if (!fullAddress || typeof fullAddress !== 'string') {
    return { street: '', city: '', state: '', zip: '', raw: fullAddress || '' };
  }

  const trimmed = fullAddress.trim();

  // Try to extract ZIP code (5 digits, optionally with -XXXX)
  const zipMatch = trimmed.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const zip = zipMatch ? zipMatch[1] : '';

  // Remove ZIP from the end
  let remainder = zipMatch
    ? trimmed.slice(0, zipMatch.index).trim().replace(/,\s*$/, '')
    : trimmed;

  // Try to extract state abbreviation (2-letter code at the end)
  const stateMatch = remainder.match(/,?\s*([A-Z]{2})\s*$/i);
  const state = stateMatch ? stateMatch[1].toUpperCase() : 'TX';

  if (stateMatch) {
    remainder = remainder.slice(0, stateMatch.index).trim().replace(/,\s*$/, '');
  }

  // Split remaining by commas: street parts, then city
  const parts = remainder.split(',').map(p => p.trim()).filter(Boolean);

  let street = '';
  let city = '';

  if (parts.length >= 2) {
    city = parts[parts.length - 1];
    street = parts.slice(0, parts.length - 1).join(', ');
  } else if (parts.length === 1) {
    street = parts[0];
    city = '';
  }

  return { street, city, state, zip, raw: trimmed };
}

module.exports = { parseFullAddress };
