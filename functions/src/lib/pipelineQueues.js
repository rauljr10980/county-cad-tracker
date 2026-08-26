/**
 * The pipeline's work-queue vocabulary and its `where`-fragment builders.
 *
 * Pure and dependency-free (no Prisma, no `req`/`res`) so they can be unit
 * tested directly — see `pipelineQueues.test.js` — without needing a
 * database. `functions/src/routes/evictions.js` is the only caller.
 *
 * Required co-edit: `src/crm-evictions/pipeline/queues.ts` defines the same
 * seven queue ids (plus their display labels) for the frontend, which cannot
 * import this CommonJS module. Update both whenever a queue id is added,
 * renamed, or removed.
 */

const QUEUES = ['all', 'needsContact', 'overdue', 'dueToday', 'upcoming', 'parked', 'closed'];

/**
 * Prisma `where` fragments shared by the corporate / assignedTo / service /
 * search filters. `/landlords` and the pipeline counts route both build off
 * this, so those four filters can never drift apart between the two.
 *
 * NOT covered here, and NOT applied by `/pipeline/counts`: `stage` and the
 * six filings filters (`dateFrom`, `dateTo`, `status`, `disposition`,
 * `precinct`, `satisfied`). `/landlords` applies those separately, after
 * calling this helper; the counts route calls only this helper, so a tab's
 * count silently ignores all seven of those parameters even though
 * `/landlords`' rows narrow by them. If any of them need to affect counts
 * too, extend this helper — not just `/landlords` — so the two stay in sync.
 *
 * Default preserves the Eviction List tab's behavior (absent `corporate`
 * means `isCorporate: false`); the CRM opts in with `all`.
 */
const baseLandlordFilter = (query) => {
  const where = {};
  if (query.corporate === 'all') { /* no filter */ }
  else if (query.corporate === 'true') where.isCorporate = true;
  else where.isCorporate = false;

  if (query.assignedTo === 'unassigned') where.assignedToId = null;
  else if (query.assignedTo) where.assignedToId = String(query.assignedTo);
  if (query.service) where.serviceInterests = { has: String(query.service) };
  if (query.search) {
    where.OR = [
      { name: { contains: String(query.search), mode: 'insensitive' } },
      { addresses: { some: { address: { contains: String(query.search), mode: 'insensitive' } } } },
    ];
  }
  return where;
};

/**
 * Prisma `where` fragments for the pipeline's work queues.
 *
 * One builder serves both the row query and the counts query, so a tab's number
 * can never disagree with what opening that tab shows.
 *
 * Boundaries are UTC to match /stats. The four active queues exclude parked and
 * closed leads: something deliberately set aside, or finished, is not work to
 * do now. `all` excludes nothing.
 */
const queueFilter = (queue) => {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(now); endOfToday.setUTCHours(23, 59, 59, 999);
  const active = { parkedAt: null, contactStage: { not: 'Closed' } };

  switch (queue) {
    case 'needsContact': return { ...active, lastContactedAt: null };
    case 'overdue':      return { ...active, nextFollowUpAt: { lt: startOfToday } };
    case 'dueToday':     return { ...active, nextFollowUpAt: { gte: startOfToday, lte: endOfToday } };
    case 'upcoming':     return { ...active, nextFollowUpAt: { gt: endOfToday } };
    case 'parked':       return { parkedAt: { not: null } };
    case 'closed':       return { contactStage: 'Closed' };
    default:             return {};
  }
};

module.exports = { QUEUES, baseLandlordFilter, queueFilter };
