const { randomUUID } = require('crypto');

class AppointmentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function parseAppointment(body, now = new Date()) {
  const { kind, startAt, endAt, propertyId, documentNumber, drivingLeadId, note = '', requestId } = body ?? {};
  if (!['APPOINTMENT', 'DEAL'].includes(kind)) throw new AppointmentError('Choose an appointment or deal meeting.');
  const sources = [propertyId, documentNumber, drivingLeadId].filter((value) => value != null);
  if (sources.length !== 1 || typeof sources[0] !== 'string' || !sources[0].trim() || sources[0].length > 200) throw new AppointmentError('Choose one property for this appointment.');
  // Require an explicit timezone offset; never interpret a local date in the
  // server's timezone. The client sends ISO timestamps from the date picker.
  if (![startAt, endAt].every((value) => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))) throw new AppointmentError('Choose a date, time, and duration.');
  const start = new Date(startAt), end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end - start > 86400000) throw new AppointmentError('The end time must follow the start time, within 24 hours.');
  if (start.getTime() < now.getTime() - 60000) throw new AppointmentError('Choose a future appointment time.');
  if (typeof note !== 'string' || note.length > 5000) throw new AppointmentError('Notes must be at most 5,000 characters.');
  if (requestId != null && (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId))) throw new AppointmentError('Invalid scheduling request.');
  return { kind, start, end, propertyId, documentNumber, drivingLeadId, note: note.trim(), requestId: requestId ?? randomUUID() };
}

async function createAppointment(db, user, body) {
  const data = parseAppointment(body);
  // The dialog retains this key on retries, avoiding duplicate calendar and
  // team-stat entries if the first response is lost after committing.
  const id = `appointment-${user.id}-${data.requestId}`;
  return db.$transaction(async (tx) => {
    const existing = await tx.followUp.findUnique({ where: { id } });
    if (existing) return existing;
    let source;
    let relation;
    if (data.propertyId) {
      source = await tx.property.findUnique({ where: { id: data.propertyId } });
      relation = { propertyId: data.propertyId };
    } else if (data.documentNumber) {
      source = await tx.preForeclosure.findUnique({ where: { documentNumber: data.documentNumber } });
      relation = { preforeclosureId: source?.id };
    } else {
      source = await tx.drivingLead.findUnique({ where: { id: data.drivingLeadId } });
      relation = { drivingLeadId: data.drivingLeadId };
    }
    if (!source) throw new AppointmentError('Property not found.', 404);
    const appointment = await tx.followUp.create({ data: {
      id, ...relation, createdById: user.id, date: data.start, endAt: data.end,
      note: data.note || null, isTeamAppointment: true, appointmentKind: data.kind,
    } });
    if (data.kind === 'APPOINTMENT') {
      await tx.activityLog.create({ data: {
        type: 'APPOINTMENT_SET', userId: user.id,
        propertyId: data.propertyId ?? null, drivingLeadId: data.drivingLeadId ?? null,
        notes: `${source.propertyAddress || source.address || source.street || source.rawAddress || source.ownerName || 'Property'} · ${data.start.toISOString()}`,
      } });
    }
    if (data.kind === 'DEAL' && data.documentNumber) {
      await tx.preForeclosure.update({ where: { documentNumber: data.documentNumber }, data: { internalStatus: 'Wants to Make a Deal' } });
    }
    return appointment;
  });
}

function calendarVisibility(user, effectiveUserId) {
  if (user.role === 'ADMIN' && user.id === effectiveUserId) return {};
  return { OR: [{ createdById: effectiveUserId }, { isTeamAppointment: true }] };
}

function canManageAppointment(user, followUp) {
  return user.role === 'ADMIN' || (user.role !== 'VIEWER' && followUp.createdById === user.id);
}

module.exports = { AppointmentError, parseAppointment, createAppointment, calendarVisibility, canManageAppointment };
