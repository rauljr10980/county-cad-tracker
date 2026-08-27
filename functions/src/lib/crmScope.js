/**
 * Where-clause builders for per-user CRM isolation, and the empty-payload rule.
 *
 * Ownership lives on CrmLead alone. CrmDeal, CrmTask, and CrmActivity each have
 * a required leadId with onDelete: Cascade, so they are scoped through the
 * relation rather than carrying a userId of their own — one column to keep
 * correct instead of four that can disagree.
 *
 * This module is dependency-free on purpose. routes/crm.js cannot be imported
 * in the test environment: it constructs a PrismaClient at require time, which
 * eagerly loads a native query-engine binary. Keeping the rules here is what
 * makes them testable.
 */

const EMPTY_PAYLOAD_CODE = 'EMPTY_PAYLOAD_GUARD';
const FOREIGN_ID_CODE = 'FOREIGN_ID';

const leadWhere = (userId) => ({ userId });

const childWhere = (userId) => ({ lead: { userId } });

const leadDeleteWhere = (userId, keepIds) => ({
  userId,
  id: { notIn: keepIds },
});

const childDeleteWhere = (userId, keepIds) => ({
  lead: { userId },
  id: { notIn: keepIds },
});

/**
 * Scoping stops one account from destroying another's data. It does not stop an
 * account from destroying its own: if the client's load fails and it then
 * autosaves an empty state, the save deletes everything the user has.
 *
 * Deliberately keyed on the lead count alone. Deals, tasks, and activities can
 * all legitimately go to zero while leads remain, so counting them here would
 * reject valid saves.
 */
const isEmptyPayloadBlocked = ({ incomingLeads, existingLeads }) =>
  incomingLeads === 0 && existingLeads > 0;

module.exports = {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
};
