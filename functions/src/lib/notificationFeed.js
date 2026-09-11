function mapFollowUpNotification(f) {
  const address = f.property?.propertyAddress || f.preForeclosure?.address || f.drivingLead?.rawAddress || 'a lead';
  const tab = f.propertyId ? 'properties' : f.preforeclosureId ? 'preforeclosure' : 'driving';
  return { type: 'followup', id: f.id, message: `Follow-up due: ${address}`, timestamp: f.date, tab };
}

function mapInboxNotification(s) {
  return { type: 'inbox', id: s.id, message: `New inquiry from ${s.name || 'a visitor'}`, timestamp: s.createdAt, tab: 'inbox' };
}

function sortByTimestampDesc(items) {
  return [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

module.exports = { mapFollowUpNotification, mapInboxNotification, sortByTimestampDesc };
