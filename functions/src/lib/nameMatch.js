/**
 * Fuzzy name matching for owner identification.
 * Handles cases where middle names differ or are abbreviated.
 * e.g. "JOHN MICHAEL SMITH" matches "JOHN M SMITH" or "JOHN SMITH"
 */

function normalize(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Returns a confidence score 0-1 for how well two names match.
 * Strategy:
 *   - First name + last name must match exactly (score >= 0.7)
 *   - Middle name match (full or initial) boosts to 1.0
 *   - Missing middle names are acceptable (score 0.9)
 *   - Conflicting middle names lower score to 0.7
 */
function fuzzyNameMatch(name1, name2) {
  const tokens1 = normalize(name1);
  const tokens2 = normalize(name2);

  if (tokens1.length < 2 || tokens2.length < 2) return 0;

  const firstName1 = tokens1[0];
  const lastName1 = tokens1[tokens1.length - 1];
  const firstName2 = tokens2[0];
  const lastName2 = tokens2[tokens2.length - 1];

  // Last name must match exactly
  if (lastName1 !== lastName2) return 0;

  // First name must match exactly
  if (firstName1 !== firstName2) return 0;

  // Base score for first + last name match
  let score = 0.8;

  const middles1 = tokens1.slice(1, -1);
  const middles2 = tokens2.slice(1, -1);

  if (middles1.length > 0 && middles2.length > 0) {
    // Both have middle names - check for match
    const matchesMiddle = middles1.some(m1 =>
      middles2.some(m2 =>
        m1 === m2 || // Full match
        (m1.length === 1 && m2.startsWith(m1)) || // Initial matches full
        (m2.length === 1 && m1.startsWith(m2))    // Full matches initial
      )
    );
    score = matchesMiddle ? 1.0 : 0.7;
  } else {
    // One or both missing middle names - still a good match
    score = 0.9;
  }

  return score;
}

const NAME_MATCH_THRESHOLD = 0.7;

module.exports = { fuzzyNameMatch, NAME_MATCH_THRESHOLD };
