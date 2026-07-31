const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const normalizeName = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9&/ ]/g, ' ').replace(/\s+/g, ' ');
const normalizeAddress = (address, city, state, zip) => [address, city, state, zip]
  .map((v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' '))
  .filter(Boolean).join('|');
const clean = (value) => {
  const v = String(value ?? '').trim();
  return v.toUpperCase() === 'NULL' ? '' : v;
};
const bool = (value) => clean(value).toUpperCase() === 'Y';
const date = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const phoneKey = (value) => clean(value).replace(/\D/g, '').slice(-10);
const chunkUploads = new Map();
const importJobs = new Map();

router.use(authenticateToken);

const handleWorkbookUpload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No workbook uploaded' });
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const required = ['CaseNbr', 'DtFile', 'Plaintiff', 'Pl Address'];
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length) return res.status(400).json({ error: `Missing required columns: ${missing.join(', ')}` });

    const errors = [];
    const valid = [];
    rows.forEach((row, index) => {
      const caseNumber = clean(row.CaseNbr);
      const name = clean(row.Plaintiff);
      if (!caseNumber || !name) {
        errors.push({ row: index + 2, error: !caseNumber ? 'Missing CaseNbr' : 'Missing Plaintiff' });
        return;
      }
      if (bool(row.CORP)) {
        errors.push({ row: index + 2, error: 'Corporate plaintiff skipped' });
        return;
      }
      valid.push({ row, caseNumber, name, normalizedName: normalizeName(name) });
    });

    const importRecord = await prisma.evictionImport.create({ data: {
      filename: req.file.originalname, totalRows: rows.length, rejectedRows: errors.length,
      errorDetails: errors.slice(0, 500), uploadedBy: req.user?.username || null,
    } });

    const landlordSeed = new Map();
    for (const item of valid) {
      if (!landlordSeed.has(item.normalizedName)) landlordSeed.set(item.normalizedName, { name: item.name, normalizedName: item.normalizedName, isCorporate: bool(item.row.CORP) });
      else if (bool(item.row.CORP)) landlordSeed.get(item.normalizedName).isCorporate = true;
    }
    await prisma.evictionLandlord.createMany({ data: [...landlordSeed.values()], skipDuplicates: true });
    const landlords = await prisma.evictionLandlord.findMany({ where: { normalizedName: { in: [...landlordSeed.keys()] } }, select: { id: true, normalizedName: true, contacts: true } });
    const landlordByName = new Map(landlords.map((l) => [l.normalizedName, l]));

    const addressMap = new Map();
    for (const item of valid) {
      const landlord = landlordByName.get(item.normalizedName);
      const address = clean(item.row['Pl Address']);
      if (!landlord || !address) continue;
      const city = clean(item.row.AddressCity), state = clean(item.row.AddressState), zip = clean(item.row.AddressZip);
      const normalizedAddress = normalizeAddress(address, city, state, zip);
      addressMap.set(`${landlord.id}|${normalizedAddress}`, { landlordId: landlord.id, address, city, state, zip, normalizedAddress });
    }
    if (addressMap.size) await prisma.evictionAddress.createMany({ data: [...addressMap.values()], skipDuplicates: true });

    const existing = [];
    const caseNumbers = [...new Set(valid.map((v) => v.caseNumber))];
    const landlordIds = landlords.map((l) => l.id);
    // Keep each PostgreSQL prepared statement well below its 32,767 bind-variable limit.
    for (let i = 0; i < caseNumbers.length; i += 5000) {
      existing.push(...await prisma.evictionFiling.findMany({
        where: { landlordId: { in: landlordIds }, caseNumber: { in: caseNumbers.slice(i, i + 5000) } },
        select: { landlordId: true, caseNumber: true },
      }));
    }
    const existingKeys = new Set(existing.map((f) => `${f.landlordId}|${f.caseNumber}`));
    let createdRows = 0, updatedRows = 0, unchangedRows = 0;
    const filingMap = new Map();
    for (const item of valid) {
      const landlord = landlordByName.get(item.normalizedName);
      if (!landlord) continue;
      const key = `${landlord.id}|${item.caseNumber}`;
      const r = item.row;
      const data = {
        importId: importRecord.id, filedDate: date(r.DtFile), caseStatus: clean(r.CaseStatusDescr), precinct: clean(r['JP PRECINCT']),
        caseType: clean(r.CASE_TYPE), corporateFlag: bool(r.CORP), satisfiedFlag: bool(r.Satisfied_FLG), disposition: clean(r.Disposition),
        dispositionDate: date(r.DispositionDate), plaintiffAddress: clean(r['Pl Address']), addressCity: clean(r.AddressCity),
        addressState: clean(r.AddressState), addressZip: clean(r.AddressZip), homePhone: clean(r.HomePhone), cellPhone: clean(r.CellPhone), workPhone: clean(r.WorkPhone),
      };
      filingMap.set(key, { landlordId: landlord.id, caseNumber: item.caseNumber, data });
    }
    const filings = [...filingMap.values()];
    for (let i = 0; i < filings.length; i += 150) {
      const batch = filings.slice(i, i + 150);
      await prisma.$transaction(batch.map((f) => prisma.evictionFiling.upsert({
        where: { landlordId_caseNumber: { landlordId: f.landlordId, caseNumber: f.caseNumber } },
        create: { landlordId: f.landlordId, caseNumber: f.caseNumber, ...f.data }, update: f.data,
      })));
      for (const f of batch) existingKeys.has(`${f.landlordId}|${f.caseNumber}`) ? updatedRows++ : createdRows++;
    }

    // Merge court-file phones into structured contacts without overwriting researched contacts.
    const phonesByLandlord = new Map();
    for (const item of valid) {
      const landlord = landlordByName.get(item.normalizedName); if (!landlord) continue;
      if (!phonesByLandlord.has(landlord.id)) phonesByLandlord.set(landlord.id, new Map());
      for (const [type, column] of [['Home', 'HomePhone'], ['Cell', 'CellPhone'], ['Work', 'WorkPhone']]) {
        const value = clean(item.row[column]), key = phoneKey(value);
        if (key.length === 10) phonesByLandlord.get(landlord.id).set(key, { number: value, status: '', type, source: 'Court file' });
      }
    }
    for (const landlord of landlords) {
      const imported = [...(phonesByLandlord.get(landlord.id)?.values() || [])]; if (!imported.length) continue;
      const contacts = landlord.contacts && typeof landlord.contacts === 'object' ? landlord.contacts : {};
      const phoneRows = Array.isArray(contacts.phoneRows) ? contacts.phoneRows : [];
      const known = new Set(phoneRows.flatMap((r) => (r.phones || []).map((p) => phoneKey(typeof p === 'string' ? p : p.number))));
      const additions = imported.filter((p) => !known.has(phoneKey(p.number)));
      if (additions.length) await prisma.evictionLandlord.update({ where: { id: landlord.id }, data: { contacts: { ...contacts, phoneRows: [...phoneRows, { name: landlordSeed.get(landlord.normalizedName)?.name || '', phones: additions }] } } });
    }

    await prisma.evictionImport.update({ where: { id: importRecord.id }, data: { createdRows, updatedRows, unchangedRows, rejectedRows: errors.length } });
    res.json({ importId: importRecord.id, totalRows: rows.length, createdRows, updatedRows, unchangedRows, rejectedRows: errors.length, landlords: landlords.length });
  } catch (error) {
    console.error('[EVICTIONS] import error', error);
    res.status(500).json({ error: 'Failed to import eviction workbook', details: error.message });
  }
};

const startImportJob = (file, user) => {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  importJobs.set(jobId, { id: jobId, status: 'processing', startedAt: new Date().toISOString() });
  setImmediate(async () => {
    let statusCode = 200;
    const response = {
      status(code) { statusCode = code; return this; },
      json(payload) {
        importJobs.set(jobId, {
          id: jobId,
          status: statusCode >= 400 ? 'failed' : 'completed',
          ...(statusCode >= 400 ? { error: payload.error, details: payload.details } : { result: payload }),
          finishedAt: new Date().toISOString(),
        });
        return payload;
      },
    };
    try { await handleWorkbookUpload({ file, user }, response); }
    catch (error) {
      console.error('[EVICTIONS] background import failed', error);
      importJobs.set(jobId, { id: jobId, status: 'failed', error: error.message, finishedAt: new Date().toISOString() });
    }
  });
  return jobId;
};

// Legacy single-request upload retained for small workbooks.
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No workbook uploaded' });
  const jobId = startImportJob(req.file, req.user);
  res.status(202).json({ jobId, status: 'processing' });
});

// Reliable upload for larger workbooks: receive small chunks, then process asynchronously.
router.post('/upload-chunk', upload.single('chunk'), (req, res) => {
  const uploadId = clean(req.body.uploadId);
  const index = Number(req.body.index), totalChunks = Number(req.body.totalChunks), totalSize = Number(req.body.totalSize);
  const filename = clean(req.body.filename);
  if (!req.file || !/^[a-zA-Z0-9-]+$/.test(uploadId) || !Number.isInteger(index) || !Number.isInteger(totalChunks) || index < 0 || index >= totalChunks || totalChunks > 1000) {
    return res.status(400).json({ error: 'Invalid upload chunk' });
  }
  let entry = chunkUploads.get(uploadId);
  if (!entry) {
    entry = { filename, totalChunks, totalSize, chunks: new Map(), createdAt: Date.now() };
    chunkUploads.set(uploadId, entry);
  }
  if (entry.totalChunks !== totalChunks || entry.filename !== filename) return res.status(409).json({ error: 'Upload metadata changed between chunks' });
  entry.chunks.set(index, req.file.buffer);
  if (entry.chunks.size < totalChunks) return res.json({ received: entry.chunks.size, totalChunks });

  const ordered = Array.from({ length: totalChunks }, (_, i) => entry.chunks.get(i));
  if (ordered.some((part) => !part)) return res.status(400).json({ error: 'One or more upload chunks are missing' });
  const buffer = Buffer.concat(ordered);
  chunkUploads.delete(uploadId);
  if (totalSize && buffer.length !== totalSize) return res.status(400).json({ error: `Upload size mismatch: expected ${totalSize}, received ${buffer.length}` });
  const jobId = startImportJob({ buffer, originalname: filename, size: buffer.length }, req.user);
  res.status(202).json({ jobId, status: 'processing', uploadedBytes: buffer.length });
});

router.get('/jobs/:jobId', (req, res) => {
  const job = importJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Import job not found or server restarted' });
  res.json(job);
});

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, uploadEntry] of chunkUploads) if (uploadEntry.createdAt < cutoff) chunkUploads.delete(id);
  for (const [id, job] of importJobs) {
    const timestamp = new Date(job.finishedAt || job.startedAt).getTime();
    if (timestamp < cutoff) importJobs.delete(id);
  }
}, 10 * 60 * 1000).unref();

router.get('/imports', async (_req, res) => res.json(await prisma.evictionImport.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })));

const ACTIVE_OPPORTUNITY_STAGES = ['Interested', 'Under Contract'];
const SERVICE_INTEREST_VALUES = ['Undecided', 'Acquisition / Sell to Us', 'Listing', 'Property Management'];

router.get('/stats', async (_req, res) => {
  try {
    const now = new Date();
    const endOfToday = new Date(now); endOfToday.setUTCHours(23, 59, 59, 999);
    const endOfNext7 = new Date(now); endOfNext7.setUTCDate(endOfNext7.getUTCDate() + 7); endOfNext7.setUTCHours(23, 59, 59, 999);

    const [total, stageGroups, assigneeGroups, unassigned, overdue, dueToday, dueNext7, serviceCounts] = await Promise.all([
      prisma.evictionLandlord.count(),
      prisma.evictionLandlord.groupBy({ by: ['contactStage'], _count: { _all: true } }),
      prisma.evictionLandlord.groupBy({ by: ['assignedToId'], _count: { _all: true }, where: { assignedToId: { not: null } } }),
      prisma.evictionLandlord.count({ where: { assignedToId: null } }),
      prisma.evictionTask.count({ where: { completed: false, dueAt: { lt: now } } }),
      prisma.evictionTask.count({ where: { completed: false, dueAt: { gte: now, lte: endOfToday } } }),
      // Follow-up task buckets are disjoint: overdue, today, and next7. To get all tasks due within 7 days, sum today + next7.
      prisma.evictionTask.count({ where: { completed: false, dueAt: { gt: endOfToday, lte: endOfNext7 } } }),
      Promise.all(SERVICE_INTEREST_VALUES.map(async (value) => [
        value,
        await prisma.evictionLandlord.count({ where: { serviceInterests: { has: value } } })
      ]))
    ]);

    const byStage = Object.fromEntries(stageGroups.map((g) => [g.contactStage, g._count._all]));

    const assigneeIds = assigneeGroups.map((g) => g.assignedToId);
    const users = assigneeIds.length
      ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, username: true } })
      : [];
    const usernameById = Object.fromEntries(users.map((u) => [u.id, u.username]));

    res.json({
      total,
      byStage,
      byService: Object.fromEntries(serviceCounts),
      byAssignee: assigneeGroups.map((g) => ({
        userId: g.assignedToId,
        username: usernameById[g.assignedToId] || 'Unknown',
        count: g._count._all
      })),
      unassigned,
      followUpsDue: { overdue, today: dueToday, next7: dueNext7 },
      activeOpportunities: ACTIVE_OPPORTUNITY_STAGES.reduce((sum, s) => sum + (byStage[s] || 0), 0),
      closedDeals: byStage['Closed'] || 0
    });
  } catch (error) {
    console.error('[EVICTIONS] Stats error:', error);
    res.status(500).json({ error: 'Unable to load stats' });
  }
});

router.get('/landlords', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  // Default preserves the Eviction List tab's behavior; the CRM opts in with `all`.
  const where = {};
  if (req.query.corporate === 'all') { /* no filter */ }
  else if (req.query.corporate === 'true') where.isCorporate = true;
  else where.isCorporate = false;

  if (req.query.assignedTo === 'unassigned') where.assignedToId = null;
  else if (req.query.assignedTo) where.assignedToId = String(req.query.assignedTo);
  if (req.query.search) where.OR = [{ name: { contains: String(req.query.search), mode: 'insensitive' } }, { addresses: { some: { address: { contains: String(req.query.search), mode: 'insensitive' } } } }];
  if (req.query.stage) where.contactStage = String(req.query.stage);
  if (req.query.service) where.serviceInterests = { has: String(req.query.service) };
  const filingSome = {};
  if (req.query.dateFrom || req.query.dateTo) filingSome.filedDate = { ...(req.query.dateFrom && { gte: new Date(String(req.query.dateFrom)) }), ...(req.query.dateTo && { lte: new Date(`${req.query.dateTo}T23:59:59.999Z`) }) };
  if (req.query.status) filingSome.caseStatus = String(req.query.status);
  if (req.query.disposition) filingSome.disposition = { contains: String(req.query.disposition), mode: 'insensitive' };
  if (req.query.precinct) filingSome.precinct = String(req.query.precinct);
  if (req.query.satisfied === 'true' || req.query.satisfied === 'false') filingSome.satisfiedFlag = req.query.satisfied === 'true';
  if (Object.keys(filingSome).length) where.filings = { some: filingSome };
  const [total, items] = await Promise.all([
    prisma.evictionLandlord.count({ where }),
    prisma.evictionLandlord.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { filings: true, addresses: true } }, filings: { orderBy: { filedDate: 'desc' }, take: 1, select: { filedDate: true } }, tasks: { where: { completed: false }, orderBy: { dueAt: 'asc' }, take: 1 }, assignedTo: { select: { id: true, username: true } } } }),
  ]);
  res.json({ items: items.map((x) => ({ ...x, filingCount: x._count.filings, addressCount: x._count.addresses, latestFilingDate: x.filings[0]?.filedDate || null, nextTask: x.tasks[0] || null, _count: undefined, filings: undefined, tasks: undefined })), total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

router.get('/landlords/:id', async (req, res) => {
  const item = await prisma.evictionLandlord.findUnique({ where: { id: req.params.id }, include: { addresses: { orderBy: { address: 'asc' } }, filings: { orderBy: { filedDate: 'desc' }, take: 500 }, activities: { orderBy: { createdAt: 'desc' }, take: 100 }, tasks: { orderBy: { dueAt: 'asc' }, take: 100 }, assignedTo: { select: { id: true, username: true } } } });
  if (!item) return res.status(404).json({ error: 'Landlord not found' }); res.json(item);
});

router.patch('/landlords/:id', async (req, res) => {
  const allowed = ['contactStage', 'serviceInterests', 'contacts', 'notes', 'lastContactedAt', 'nextFollowUpAt', 'assignedToId'];
  const data = {}; for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) data[key] = key.endsWith('At') && req.body[key] ? new Date(req.body[key]) : req.body[key];
  res.json(await prisma.evictionLandlord.update({ where: { id: req.params.id }, data }));
});

router.post('/landlords/:id/activities', async (req, res) => res.json(await prisma.evictionActivity.create({ data: { landlordId: req.params.id, kind: req.body.kind || 'note', body: clean(req.body.body) } })));
router.post('/landlords/:id/tasks', async (req, res) => res.json(await prisma.evictionTask.create({ data: { landlordId: req.params.id, type: req.body.type || 'Call', dueAt: new Date(req.body.dueAt), notes: clean(req.body.notes) } })));
router.patch('/tasks/:id', async (req, res) => res.json(await prisma.evictionTask.update({ where: { id: req.params.id }, data: { completed: !!req.body.completed, completedAt: req.body.completed ? new Date() : null } })));

router.post('/landlords/:id/merge', async (req, res) => {
  const sourceId = req.body.sourceId, targetId = req.params.id;
  if (!sourceId || sourceId === targetId) return res.status(400).json({ error: 'Choose a different source landlord' });
  await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([tx.evictionLandlord.findUnique({ where: { id: sourceId } }), tx.evictionLandlord.findUnique({ where: { id: targetId } })]);
    if (!source || !target) throw new Error('Landlord not found');
    const sourceFilings = await tx.evictionFiling.findMany({ where: { landlordId: sourceId } });
    for (const f of sourceFilings) await tx.evictionFiling.upsert({ where: { landlordId_caseNumber: { landlordId: targetId, caseNumber: f.caseNumber } }, create: { ...f, id: undefined, landlordId: targetId }, update: { caseStatus: f.caseStatus, disposition: f.disposition, dispositionDate: f.dispositionDate, importId: f.importId } });
    const sourceAddresses = await tx.evictionAddress.findMany({ where: { landlordId: sourceId } });
    await tx.evictionAddress.createMany({ data: sourceAddresses.map(({ id, ...a }) => ({ ...a, landlordId: targetId })), skipDuplicates: true });
    await tx.evictionActivity.updateMany({ where: { landlordId: sourceId }, data: { landlordId: targetId } });
    await tx.evictionTask.updateMany({ where: { landlordId: sourceId }, data: { landlordId: targetId } });
    await tx.evictionFiling.deleteMany({ where: { landlordId: sourceId } }); await tx.evictionAddress.deleteMany({ where: { landlordId: sourceId } }); await tx.evictionLandlord.delete({ where: { id: sourceId } });
  });
  res.json({ ok: true });
});

module.exports = router;
