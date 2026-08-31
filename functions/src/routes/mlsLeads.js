const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { classifyOwner, searchName } = require('../lib/mlsOwner');
const { parseSheet, dedupe } = require('../lib/mlsWorkbook');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticateToken);

// Import. Batched rather than one transaction per row: the eviction importer
// originally ran 294 transactions against a 5-second default timeout and never
// completed on a large workbook.
router.post('/import', upload.array('files'), async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = [];
    for (const file of req.files || []) {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      for (const name of wb.SheetNames) {
        rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }));
      }
    }

    const leads = dedupe(parseSheet(rows));
    if (!leads.length) return res.status(400).json({ error: 'No rows with an MLS number were found' });

    const existing = await prisma.mlsLead.findMany({
      where: { userId, mlsNumber: { in: leads.map((l) => l.mlsNumber) } },
      select: { id: true, mlsNumber: true, status: true },
    });
    const byNumber = new Map(existing.map((row) => [row.mlsNumber, row]));

    let created = 0;
    let updated = 0;
    let statusChanges = 0;

    for (const lead of leads) {
      const prior = byNumber.get(lead.mlsNumber);
      if (!prior) {
        const row = await prisma.mlsLead.create({ data: { ...lead, userId } });
        await createContact(row.id, lead.mlsOwnerRaw);
        created += 1;
        continue;
      }
      // A status change is the buy signal — record where it came from rather
      // than overwriting it.
      const changed = prior.status !== lead.status;
      await prisma.mlsLead.update({
        where: { id: prior.id },
        data: {
          ...lead,
          ...(changed && {
            previousStatus: prior.status,
            statusChangedAt: new Date(),
            hidden: false,
            hiddenAt: null,
          }),
        },
      });
      if (changed) statusChanges += 1;
      updated += 1;
    }

    res.json({ created, updated, statusChanges, total: leads.length });
  } catch (err) {
    console.error('[MLS] import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

async function createContact(mlsLeadId, rawOwner) {
  const nameKind = classifyOwner(rawOwner);
  if (nameKind !== 'person' && nameKind !== 'entity') return;
  await prisma.mlsContact.create({
    data: {
      mlsLeadId,
      role: 'mls_owner',
      name: String(rawOwner).trim(),
      nameKind,
      searchName: searchName(rawOwner),
    },
  });
}

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const where = { userId: req.user.id };

  if (req.query.showHidden !== 'true') where.hidden = false;
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.county) where.county = String(req.query.county);
  if (req.query.minUnits) where.totalUnits = { gte: Number(req.query.minUnits) };
  if (req.query.search) {
    const search = String(req.query.search);
    where.OR = [
      { address: { contains: search, mode: 'insensitive' } },
      { mlsOwnerRaw: { contains: search, mode: 'insensitive' } },
      { mlsNumber: { contains: search } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.mlsLead.count({ where }),
    prisma.mlsLead.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
      include: { contacts: true },
    }),
  ]);

  res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

router.get('/:id', async (req, res) => {
  const item = await prisma.mlsLead.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { contacts: { orderBy: { role: 'asc' } } },
  });
  if (!item) return res.status(404).json({ error: 'Lead not found' });
  res.json(item);
});

router.patch('/:id', async (req, res) => {
  const allowed = ['notes', 'hidden'];
  const data = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) data[key] = req.body[key];
  }
  if (Object.prototype.hasOwnProperty.call(data, 'hidden')) {
    data.hiddenAt = data.hidden ? new Date() : null;
  }
  const result = await prisma.mlsLead.updateMany({ where: { id: req.params.id, userId: req.user.id }, data });
  if (!result.count) return res.status(404).json({ error: 'Lead not found' });
  res.json({ ok: true });
});

module.exports = router;
