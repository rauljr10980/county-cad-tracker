// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createSettingsRouter } from './settings.js';
import { TAB_IDS, requireTabAccess } from '../lib/tabAccess.js';

let server, origin;
let assignments = { mls: ['raul'] };
const db = {
  appSetting: {
    findMany: vi.fn(async () => [{ key: 'hiddenTabs', value: '["mls"]' }, { key: 'tabMembers', value: JSON.stringify(assignments) }]),
    upsert: vi.fn(async ({ update }) => { assignments = JSON.parse(update.value); }),
  },
  user: { findMany: vi.fn(async () => [{ id: 'raul', username: 'Raul', role: 'OPERATOR' }, { id: 'manager', username: 'Manager', role: 'ADMIN' }]) },
};
const auth = (req, res, next) => { if (!req.headers.authorization) return res.sendStatus(401); req.user = { id: req.headers.authorization, role: req.headers.authorization === 'manager' ? 'ADMIN' : 'OPERATOR' }; next(); };
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use('/settings', createSettingsRouter({ db, authenticate: auth, admin: (req, res, next) => req.user.role === 'ADMIN' ? next() : res.sendStatus(403), viewAs: (req, res, next) => { req.effectiveUserId = req.user.id; next(); } }));
  app.get('/mls', auth, requireTabAccess('mls', db), (req, res) => res.json({ allowed: true }));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
const get = (path, user = 'raul') => fetch(origin + path, { headers: { Authorization: user } });
describe('saved per-tab memberships', () => {
  it('only lets managers inspect or change the full team assignments', async () => {
    expect((await get('/settings/tab-members', '')).status).toBe(401);
    expect((await get('/settings/tab-members')).status).toBe(403);
    expect((await get('/settings/tab-members', 'manager')).status).toBe(200);
  });
  it('resolves each member independently and enforces MLS at the endpoint', async () => {
    expect((await (await get('/settings/hidden-tabs')).json()).hiddenTabs).not.toContain('mls');
    expect((await (await get('/settings/hidden-tabs', 'manager')).json()).hiddenTabs).toContain('mls');
    expect((await get('/mls')).status).toBe(200);
    expect((await get('/mls', 'manager')).status).toBe(403);
  });
  it('persists manager selections and applies revocations to subsequent API requests', async () => {
    const tabMembers = Object.fromEntries(TAB_IDS.map(tab => [tab, tab === 'mls' ? ['manager'] : ['raul', 'manager']]));
    const result = await fetch(origin + '/settings/tab-members', { method: 'PUT', headers: { Authorization: 'manager', 'Content-Type': 'application/json' }, body: JSON.stringify({ tabMembers }) });
    expect(result.status).toBe(200);
    expect(db.appSetting.upsert).toHaveBeenCalledOnce();
    expect((await get('/mls')).status).toBe(403);
    expect((await get('/mls', 'manager')).status).toBe(200);
  });
  it('rejects unknown user IDs without saving', async () => {
    const tabMembers = Object.fromEntries(TAB_IDS.map(tab => [tab, ['stranger']]));
    const result = await fetch(origin + '/settings/tab-members', { method: 'PUT', headers: { Authorization: 'manager', 'Content-Type': 'application/json' }, body: JSON.stringify({ tabMembers }) });
    expect(result.status).toBe(400);
    expect(db.appSetting.upsert).toHaveBeenCalledOnce();
  });
});
