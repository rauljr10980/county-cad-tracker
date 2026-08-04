#!/usr/bin/env node
/**
 * Geocodes eviction addresses by driving the backend's batch endpoint.
 *
 * The work itself happens server-side so it runs next to the database and
 * respects Nominatim's one-request-per-second limit. This script just keeps
 * asking for the next batch and reports progress.
 *
 * Resumable: every address is marked as it completes, so killing this and
 * restarting picks up where it stopped. Re-running after a workbook import
 * geocodes only the newly added addresses.
 *
 * Usage:
 *   AUTH_TOKEN=<jwt> node scripts/geocode-eviction-addresses.js
 *   AUTH_TOKEN=<jwt> API_BASE_URL=http://localhost:8080 node scripts/geocode-eviction-addresses.js
 *
 * The token is any logged-in user's JWT - the eviction routes sit behind
 * authenticateToken. Read it from localStorage.authToken in a browser session.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'https://county-cad-tracker-production.up.railway.app';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 25;

if (!AUTH_TOKEN) {
  console.error('AUTH_TOKEN is required. Copy localStorage.authToken from a logged-in browser session.');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` };

const request = async (path, init) => {
  const response = await fetch(`${API_BASE_URL}/api/evictions${path}`, { ...init, headers });
  const text = await response.text();
  let body = {};
  try { if (text) body = JSON.parse(text); } catch { body = { error: text }; }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
};

const formatDuration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

(async () => {
  const started = Date.now();
  const initial = await request('/geocode/status');

  console.log(`Addresses: ${initial.total} total, ${initial.ok} geocoded, ${initial.failed} failed, ${initial.pending} pending`);
  if (!initial.pending) {
    console.log('Nothing to do.');
    return;
  }

  // Nominatim allows one request per second, so the run time is essentially
  // the pending count in seconds. Worth saying out loud before someone waits.
  console.log(`Estimated run time: about ${formatDuration(initial.pending * 1100)}. Safe to stop and restart.\n`);

  let ok = 0, failed = 0, emptyBatches = 0;

  for (;;) {
    const batch = await request('/geocode/batch', { method: 'POST', body: JSON.stringify({ size: BATCH_SIZE }) });
    ok += batch.ok;
    failed += batch.failed;

    // A batch that processed nothing while work remains means the geocoder is
    // refusing us - rate limited or down. Backing off beats hammering it.
    if (batch.processed === 0) {
      if (batch.remaining === 0) break;
      emptyBatches++;
      if (emptyBatches >= 3) {
        console.error(`\nStopped: ${batch.remaining} addresses still pending but the geocoder returned nothing three times.`);
        console.error('It is probably rate limiting us. Wait a few minutes and run again - progress is saved.');
        process.exitCode = 1;
        return;
      }
      console.log('Empty batch, backing off for 30s...');
      await new Promise((resolve) => setTimeout(resolve, 30000));
      continue;
    }

    emptyBatches = 0;
    const done = initial.total - batch.remaining;
    const percent = Math.round((done / initial.total) * 100);
    console.log(`${percent}% - ${done}/${initial.total} done, ${batch.remaining} remaining (${ok} located, ${failed} unresolvable)`);

    if (batch.remaining === 0) break;
  }

  console.log(`\nFinished in ${formatDuration(Date.now() - started)}: ${ok} located, ${failed} could not be resolved.`);
  if (failed) console.log('Unresolvable addresses stay marked "failed" and are simply left off the map.');
})().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  console.error('Progress is saved - run again to resume.');
  process.exit(1);
});
