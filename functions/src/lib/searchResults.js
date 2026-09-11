const MIN_QUERY_LENGTH = 2;

function isQueryTooShort(q) {
  return typeof q !== 'string' || q.trim().length < MIN_QUERY_LENGTH;
}

function mapPropertyResult(p) {
  return { type: 'property', id: p.id, label: p.propertyAddress || p.ownerName, sublabel: p.ownerName, tab: 'properties' };
}
function mapPreForeclosureResult(p) {
  return { type: 'preforeclosure', id: p.id, label: p.address, sublabel: p.city, tab: 'preforeclosure' };
}
function mapCrmLeadResult(l) {
  return { type: 'crmLead', id: l.id, label: l.ownerName || l.businessName, sublabel: l.phone || l.email, tab: 'crm' };
}
function mapMlsLeadResult(m) {
  return { type: 'mlsLead', id: m.id, label: m.address, sublabel: m.status, tab: 'mls' };
}

module.exports = {
  MIN_QUERY_LENGTH,
  isQueryTooShort,
  mapPropertyResult,
  mapPreForeclosureResult,
  mapCrmLeadResult,
  mapMlsLeadResult,
};
