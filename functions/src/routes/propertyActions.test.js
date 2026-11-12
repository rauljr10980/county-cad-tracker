// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createPropertyLabelsRouter } from './propertyLabels.js';
import { createAppointmentsRouter } from './appointments.js';

const update = vi.fn().mockResolvedValue({ ownerIsLlc: true });
const transaction = vi.fn();
let server, origin;
const authenticate = (req, res, next) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: 'u1', role: req.headers.authorization }; next();
};
const writers = (req, res, next) => ['ADMIN', 'OPERATOR'].includes(req.user.role) ? next() : res.sendStatus(403);
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use('/labels', createPropertyLabelsRouter({ db: { property: { update }, preForeclosure: { update }, drivingLead: { update } }, authenticate, writers }));
  app.use('/appointments', createAppointmentsRouter({ db: { $transaction: transaction }, authenticate, writers }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
const send = (path, method, body, role) => fetch(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: role } : {}) }, body: JSON.stringify(body) });
describe('property action endpoints', () => {
  it.each([['/labels/llc', 'PATCH'], ['/appointments', 'POST']])('requires a writer for %s', async (path, method) => {
    expect((await send(path, method, {})).status).toBe(401);
    expect((await send(path, method, {}, 'VIEWER')).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['property', 'preforeclosure', 'driving'])('persists an LLC label for %s', async (type) => {
    const result = await send('/labels/llc', 'PATCH', { type, id: 'record1', ownerIsLlc: true }, 'OPERATOR');
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ownerIsLlc: true });
    expect(update).toHaveBeenLastCalledWith({ where: type === 'preforeclosure' ? { documentNumber: 'record1' } : { id: 'record1' }, data: { ownerIsLlc: true }, select: { ownerIsLlc: true } });
  });
  it('rejects malformed scheduling and LLC requests', async () => {
    expect((await send('/labels/llc', 'PATCH', { type: 'property', id: 'p1', ownerIsLlc: 'true' }, 'ADMIN')).status).toBe(400);
    expect((await send('/appointments', 'POST', {}, 'OPERATOR')).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});
