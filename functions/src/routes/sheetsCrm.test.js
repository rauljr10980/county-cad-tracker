import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createSheetsCrmRouter } from './sheetsCrm.js';
import { requireTabAccess } from '../lib/tabAccess.js';

const load = vi.fn().mockResolvedValue({ rows: [] });
const update = vi.fn().mockResolvedValue({ success: true });
const sync = vi.fn().mockResolvedValue({ busy: false, successful: 3, failed: 0 });
let server;
let origin;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sheets-crm', createSheetsCrmRouter({
    authenticate(req, res, next) {
      if (!req.headers.authorization) return res.sendStatus(401);
      req.user = { id: req.headers.authorization.toLowerCase(), role: req.headers.authorization };
      next();
    },
    access: requireTabAccess('sheetsCrm', { appSetting: { findMany: async () => [{ key: 'tabMembers', value: JSON.stringify({ sheetsCrm: ['admin', 'operator', 'viewer'] }) }] } }),
    load, update,
    syncService: { sync, getStatus: async () => ({ storage: 'postgresql', autoSyncMinutes: 5, worksheets: [] }) },
    status: () => ({ configured: true, serviceAccountEmail: 'service@example.test' }),
  }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}/api/sheets-crm`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('Sheets CRM access', () => {
  it('rejects unauthenticated and unsubscribed reads, and allows subscribed teammates', async () => {
    expect((await fetch(origin)).status).toBe(401);
    expect((await fetch(origin, { headers: { Authorization: 'UNSUBSCRIBED' } })).status).toBe(403);
    expect((await fetch(origin, { headers: { Authorization: 'OPERATOR' } })).status).toBe(200);
    expect((await fetch(origin, { headers: { Authorization: 'VIEWER' } })).status).toBe(200);
  });
  it('rejects teammate impersonation and protects write routes with the same manager gate', async () => {
    expect((await fetch(`${origin}/tabs/46204754/rows`, { headers: { Authorization: 'ADMIN', 'X-View-As-User': 'teammate' } })).status).toBe(403);
    expect((await fetch(`${origin}/tabs/46204754/rows/2`, { method: 'PATCH', headers: { Authorization: 'VIEWER', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it('allows managers and prevents shared caches from storing worksheet data', async () => {
    const response = await fetch(`${origin}/tabs/46204754/rows`, { headers: { Authorization: 'ADMIN' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(load).toHaveBeenCalledWith(46204754);
  });
  it('allows subscribed writers to import and rejects viewers and unsubscribed accounts', async () => {
    const run = role => fetch(`${origin}/sync`, { method: 'POST', headers: { Authorization: role } });
    expect((await run('VIEWER')).status).toBe(403);
    expect((await run('UNSUBSCRIBED')).status).toBe(403);
    expect((await run('OPERATOR')).status).toBe(200);
    expect(sync).toHaveBeenCalledOnce();
  });
  it('reports a pending import after a successful source write instead of encouraging a duplicate save', async () => {
    sync.mockRejectedValueOnce(new Error('Database unavailable'));
    const response = await fetch(`${origin}/tabs/46204754/rows/2`, { method: 'PATCH', headers: { Authorization: 'ADMIN', 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, syncPending: true });
  });
});
