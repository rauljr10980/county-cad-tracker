import { describe, expect, it, vi } from 'vitest';
import { parseAppointment, createAppointment, calendarVisibility, canManageAppointment } from './appointments.js';

const body = (extra = {}) => ({ kind: 'APPOINTMENT', propertyId: 'p1', startAt: '2099-11-12T14:00:00-06:00', endAt: '2099-11-12T15:00:00-06:00', requestId: 'request-1234567890', ...extra });
function database() {
  const tx = {
    property: { findUnique: vi.fn().mockResolvedValue({ id: 'p1', propertyAddress: '123 Main St' }) },
    preForeclosure: { findUnique: vi.fn().mockResolvedValue({ id: 'pf1' }), update: vi.fn() },
    drivingLead: { findUnique: vi.fn().mockResolvedValue({ id: 'd1' }) },
    followUp: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    activityLog: { create: vi.fn() },
  };
  return { tx, $transaction: vi.fn((fn) => fn(tx)) };
}
describe('team appointments', () => {
  it('stores the selected instant and duration, with a team appointment and activity in one transaction', async () => {
    const db = database();
    const result = await createAppointment(db, { id: 'u1' }, body());
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ propertyId: 'p1', createdById: 'u1', isTeamAppointment: true, appointmentKind: 'APPOINTMENT', date: new Date('2099-11-12T20:00:00Z'), endAt: new Date('2099-11-12T21:00:00Z') });
    expect(db.tx.activityLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'APPOINTMENT_SET', userId: 'u1', propertyId: 'p1' }) });
  });
  it('sets a preforeclosure deal status only as part of saving its meeting', async () => {
    const db = database();
    const result = await createAppointment(db, { id: 'u1' }, body({ kind: 'DEAL', propertyId: undefined, documentNumber: 'DOC1' }));
    expect(result).toMatchObject({ preforeclosureId: 'pf1', appointmentKind: 'DEAL', isTeamAppointment: true });
    expect(db.tx.preForeclosure.update).toHaveBeenCalledWith({ where: { documentNumber: 'DOC1' }, data: { internalStatus: 'Wants to Make a Deal' } });
    expect(db.tx.activityLog.create).not.toHaveBeenCalled();
  });
  it('returns a committed retry without duplicating the appointment or activity', async () => {
    const db = database();
    db.tx.followUp.findUnique.mockResolvedValue({ id: 'existing' });
    expect(await createAppointment(db, { id: 'u1' }, body())).toEqual({ id: 'existing' });
    expect(db.tx.followUp.create).not.toHaveBeenCalled();
    expect(db.tx.activityLog.create).not.toHaveBeenCalled();
  });
  it('rejects a missing source before writing', async () => {
    const db = database(); db.tx.property.findUnique.mockResolvedValue(null);
    await expect(createAppointment(db, { id: 'u1' }, body())).rejects.toMatchObject({ status: 404 });
    expect(db.tx.followUp.create).not.toHaveBeenCalled();
  });
  it.each([
    { documentNumber: 'also-a-source' }, { propertyId: undefined }, { startAt: '2099-11-12T14:00:00' },
    { startAt: '2020-01-01T00:00:00Z', endAt: '2020-01-01T01:00:00Z' }, { endAt: '2099-11-12T13:00:00-06:00' },
  ])('rejects invalid scheduling input %j', (extra) => expect(() => parseAppointment(body(extra))).toThrow());
  it('includes shared appointments while keeping personal follow-ups scoped to their owner', () => {
    expect(calendarVisibility({ id: 'u1', role: 'OPERATOR' }, 'u1')).toEqual({ OR: [{ createdById: 'u1' }, { isTeamAppointment: true }] });
    expect(calendarVisibility({ id: 'admin', role: 'ADMIN' }, 'admin')).toEqual({});
    expect(calendarVisibility({ id: 'admin', role: 'ADMIN' }, 'u2')).toEqual({ OR: [{ createdById: 'u2' }, { isTeamAppointment: true }] });
    expect(canManageAppointment({ id: 'u2', role: 'OPERATOR' }, { createdById: 'u1' })).toBe(false);
    expect(canManageAppointment({ id: 'u1', role: 'VIEWER' }, { createdById: 'u1' })).toBe(false);
    expect(canManageAppointment({ id: 'u1', role: 'OPERATOR' }, { createdById: 'u1' })).toBe(true);
    expect(canManageAppointment({ id: 'admin', role: 'ADMIN' }, { createdById: 'u1' })).toBe(true);
  });
});
