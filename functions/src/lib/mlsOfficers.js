/**
 * Promotes an entity's officer/agent roster (comptroller.js's
 * `entity.officers` — a clean `{ name, title, address }[]` from
 * officerInfo, already deduped by exact name+title) into the set of distinct
 * *people* worth their own MlsContact.
 *
 * That distinction matters: officerInfo can carry the same person twice —
 * DIRECTOR and PRESIDENT for the same "ALEX J MIHAILA" — which is one human
 * with two roles, not two humans. Each becomes exactly one MlsContact, with
 * every title it carries joined onto one line, so re-running the entity
 * lookup finds the same person again (by name) rather than creating a
 * second contact next to the first.
 */

const str = (value) => (value == null ? '' : String(value).trim());

// Case/whitespace-insensitive — officerInfo repeats an exact name string for
// the same person across title rows (see the Mihaila fixture in
// comptroller.test.js), so this does not need to reconcile spelling
// variants (a middle initial present in one row and not another, say); it
// only needs to treat "ALEX J MIHAILA" and "alex j mihaila" as the same key.
const normalizeOfficerName = (name) => str(name).toUpperCase().replace(/\s+/g, ' ');

// One row in the return value per distinct person, in first-seen order.
// Titles are joined with " · " in the order first encountered; a blank
// title is dropped rather than leaving a stray separator.
function dedupeOfficers(officers) {
  if (!Array.isArray(officers)) return [];
  const order = [];
  const byKey = new Map();
  for (const raw of officers) {
    if (!raw || typeof raw !== 'object') continue;
    const name = str(raw.name);
    if (!name) continue;
    const key = normalizeOfficerName(name);
    const title = str(raw.title);
    const address = str(raw.address);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name, titles: [], address: '' };
      byKey.set(key, entry);
      order.push(key);
    }
    if (title && !entry.titles.includes(title)) entry.titles.push(title);
    if (!entry.address && address) entry.address = address;
  }
  return order.map((key) => {
    const entry = byKey.get(key);
    return { name: entry.name, title: entry.titles.join(' · '), address: entry.address };
  });
}

module.exports = { dedupeOfficers, normalizeOfficerName };
