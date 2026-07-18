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

router.use(authenticateToken);

router.post('/upload', upload.single('file'), async (req, res) => {
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

    const existing = await prisma.evictionFiling.findMany({
      where: { landlordId: { in: landlords.map((l) => l.id) }, caseNumber: { in: [...new Set(valid.map((v) => v.caseNumber))] } },
      select: { landlordId: true, caseNumber: true },
    });
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
});

router.get('/imports', async (_req, res) => res.json(await prisma.evictionImport.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })));

router.get('/landlords', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const where = {};
  if (req.query.search) where.OR = [{ name: { contains: String(req.query.search), mode: 'insensitive' } }, { addresses: { some: { address: { contains: String(req.query.search), mode: 'insensitive' } } } }];
  if (req.query.corporate === 'true' || req.query.corporate === 'false') where.isCorporate = req.query.corporate === 'true';
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
      include: { _count: { select: { filings: true, addresses: true } }, filings: { orderBy: { filedDate: 'desc' }, take: 1, select: { filedDate: true } }, tasks: { where: { completed: false }, orderBy: { dueAt: 'asc' }, take: 1 } } }),
  ]);
  res.json({ items: items.map((x) => ({ ...x, filingCount: x._count.filings, addressCount: x._count.addresses, latestFilingDate: x.filings[0]?.filedDate || null, nextTask: x.tasks[0] || null, _count: undefined, filings: undefined, tasks: undefined })), total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

router.get('/landlords/:id', async (req, res) => {
  const item = await prisma.evictionLandlord.findUnique({ where: { id: req.params.id }, include: { addresses: { orderBy: { address: 'asc' } }, filings: { orderBy: { filedDate: 'desc' }, take: 500 }, activities: { orderBy: { createdAt: 'desc' }, take: 100 }, tasks: { orderBy: { dueAt: 'asc' }, take: 100 } } });
  if (!item) return res.status(404).json({ error: 'Landlord not found' }); res.json(item);
});

router.patch('/landlords/:id', async (req, res) => {
  const allowed = ['contactStage', 'serviceInterests', 'contacts', 'notes', 'lastContactedAt', 'nextFollowUpAt'];
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
