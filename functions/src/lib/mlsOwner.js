/**
 * The connectMLS `Owner` column is agent-typed free text. Across 2,321 deduped
 * listings it is 55% person names, 32% entities, 7.5% instructions to the agent
 * ("See Offer Instructions", "yep"), and 5% an address typed where a name
 * belongs. Classifying it is what keeps the junk out of a call list.
 *
 * Rule order matters: junk is tested before addressLike, so "See 123 Main"
 * classifies as junk rather than as an address.
 */

const JUNK = /^(see\b|private owner|yep$|n\/?a$|unknown|owner$|agent$|call\b|tbd$|none$|[.\-*]+$)/i;
// Bare "CO" used to be in this list and false-positived on real surnames
// ("Jason Co") — removed. "LCC" is kept for the common LLC typo, matching
// the same fix in comptroller.js's suffix stripper.
const ENTITY =
  /\b(LLC|L\.L\.C|LCC|PLLC|LP|L\.P|LLP|LLLP|INC|TRUST|PROPERTIES|CORP|HOLDINGS|LTD|INVESTMENTS|PARTNERS|COMPANY|GROUP|ENTERPRISES|REALTY|RENTALS|MANAGEMENT|VENTURES|ASSOCIATES|EQUITY|CAPITAL|DEVELOPMENT|HOMES|ESTATES)\b/i;
// A trailing single letter is a middle initial, not a surname.
const INITIAL = /^[A-Z]$/i;

const classifyOwner = (raw) => {
  const value = String(raw ?? '').trim();
  if (value.length < 2) return 'blank';
  if (JUNK.test(value)) return 'junk';
  if (/\d/.test(value)) return 'addressLike';
  return ENTITY.test(value) ? 'entity' : 'person';
};

/**
 * Individual owners arrive surname-first — "Baugher Jason E", or
 * "MARTINEZ, PETRA" in the eviction data. People-search sites want given name
 * first. Entities are returned untouched: "Properties Baabco II LLC" would
 * find nothing.
 */
const searchName = (raw) => {
  const kind = classifyOwner(raw);
  if (kind !== 'person') return kind === 'entity' ? String(raw).trim() : '';

  const value = String(raw).trim();
  // Defense in depth: never reorder a name that carries an entity token,
  // even if classifyOwner somehow said "person" — a garbled surname-first
  // flip of a company name ("ONE IN ALL LCC" -> "IN ALL LCC ONE") is worse
  // than leaving it alone.
  if (ENTITY.test(value)) return value;

  if (value.includes(',')) {
    const [surname, rest] = value.split(',', 2);
    const given = rest.trim();
    return given ? `${given} ${surname.trim()}` : surname.trim();
  }

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return value;

  const [surname, ...rest] = parts;
  const given = rest.filter((part) => !INITIAL.test(part));
  return given.length ? `${given.join(' ')} ${surname}` : `${rest.join(' ')} ${surname}`;
};

module.exports = { classifyOwner, searchName };
