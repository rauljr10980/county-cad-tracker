const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { classifyOwner, searchName } = require('../lib/mlsOwner');
const { parseSheet, dedupe } = require('../lib/mlsWorkbook');
const { searchEntity } = require('../lib/comptroller');

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

// Bexar CAD (bexar.acttax.com) owner lookup by street address.
//
// functions/src/lib/ownerLookup.js also has a `lookupBexarTaxAssessor`, but
// it drives Puppeteer against the same site and is not what's actually wired
// up: preforeclosure.js's `/:documentNumber/owner-lookup` route (see
// functions/src/routes/preforeclosure.js) calls a local direct-HTTP-POST
// helper instead ("no Puppeteer/n8n needed"). That is the live convention —
// same URL, same POST body, same owner-responsive-cell parsing, same
// { ownerName, ownerAddress, error } return shape — duplicated here rather
// than importing a second module Task 2 wasn't asked to touch.
async function lookupBexarOwner(address) {
  const searchAddress = String(address).toUpperCase().trim();
  console.log(`[MLS] CAD lookup: searching tax assessor for "${searchAddress}"`);

  const response = await fetch('https://bexar.acttax.com/act_webdev/bexar/showlist.jsp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `searchby=6&criteria=${encodeURIComponent(searchAddress)}&subcriteria=`,
  });

  if (!response.ok) {
    throw new Error(`Tax assessor returned ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // <td class="owner-responsive">OWNER NAME<br>STREET<br>CITY, STATE  ZIP</td>
  const ownerMatch = html.match(/<td class="owner-responsive"[^>]*>(?:<!--[^>]*-->\s*)?([\s\S]*?)\s*<\/td>/);
  if (!ownerMatch) {
    return { ownerName: null, ownerAddress: null, error: 'No results found' };
  }

  const parts = ownerMatch[1].split(/<br\s*\/?>/).map((s) => s.trim()).filter(Boolean);
  const ownerName = parts[0] || null;
  const ownerAddress = parts.slice(1).join(', ') || null;

  return { ownerName, ownerAddress };
}

// Order-independent name comparison, so "Baugher Jason E" (MLS raw, surname
// first) and "BAUGHER JASON E" (CAD, upper-cased) are recognised as the same
// person even though word order/case may differ between the two sources.
const normalizeNameForMatch = (raw) =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');

const namesMatch = (a, b) => {
  const left = normalizeNameForMatch(a);
  const right = normalizeNameForMatch(b);
  return Boolean(left) && left === right;
};

const formatMailingAddress = (entity) =>
  [entity.address, [entity.city, [entity.state, entity.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ');

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

// CAD lookup: one lead at a time. The scraper (a direct HTTP call here, see
// lookupBexarOwner above) is not something we want blocking a batch, so this
// route is deliberately single-lead rather than looping over a filtered set.
router.post('/:id/cad-lookup', async (req, res) => {
  const lead = await prisma.mlsLead.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { contacts: true },
  });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (lead.county !== 'Bexar') {
    await prisma.mlsLead.update({
      where: { id: lead.id },
      data: { cadLookupStatus: 'unsupported_county', cadLookupAt: new Date() },
    });
    return res.status(400).json({ error: 'CAD lookup only covers Bexar County', cadLookupStatus: 'unsupported_county' });
  }

  try {
    const result = await lookupBexarOwner(lead.address);
    const ownerName = result.ownerName?.trim();

    if (!ownerName || ownerName.length < 3) {
      await prisma.mlsLead.update({
        where: { id: lead.id },
        data: { cadLookupStatus: 'failed', cadLookupAt: new Date() },
      });
      return res.json({ success: false, cadLookupStatus: 'failed', error: result.error || 'No owner found' });
    }

    const mailingAddress = result.ownerAddress?.trim() || '';
    const nameKind = classifyOwner(ownerName);

    // If the CAD name is the same person/entity as the existing mls_owner
    // contact, enrich that record instead of creating a second one.
    const mlsOwner = lead.contacts.find((c) => c.role === 'mls_owner');
    const role = mlsOwner && namesMatch(mlsOwner.name, ownerName) ? 'mls_owner' : 'cad_owner';

    const contact = await prisma.mlsContact.upsert({
      where: { mlsLeadId_role: { mlsLeadId: lead.id, role } },
      update: { name: ownerName, nameKind, searchName: searchName(ownerName), mailingAddress },
      create: { mlsLeadId: lead.id, role, name: ownerName, nameKind, searchName: searchName(ownerName), mailingAddress },
    });

    await prisma.mlsLead.update({
      where: { id: lead.id },
      data: { cadLookupStatus: 'success', cadLookupAt: new Date() },
    });

    res.json({ success: true, cadLookupStatus: 'success', contact });
  } catch (err) {
    console.error('[MLS] CAD lookup error:', err);
    await prisma.mlsLead.update({
      where: { id: lead.id },
      data: { cadLookupStatus: 'failed', cadLookupAt: new Date() },
    });
    res.status(500).json({ error: 'CAD lookup failed', cadLookupStatus: 'failed' });
  }
});

// Comptroller entity lookup for a single contact. Scoped through the parent
// lead's userId since MlsContact carries no userId of its own.
router.post('/contacts/:contactId/entity-lookup', async (req, res) => {
  const contact = await prisma.mlsContact.findFirst({
    where: { id: req.params.contactId, lead: { userId: req.user.id } },
  });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  if (contact.nameKind !== 'entity') {
    return res.status(400).json({ error: 'Only entity contacts can be looked up with the Comptroller' });
  }

  try {
    const result = await searchEntity(contact.name);

    if (!result.ok) {
      const updated = await prisma.mlsContact.update({
        where: { id: contact.id },
        data: { entityLookupStatus: 'failed', entityLookupAt: new Date() },
      });
      return res.json({ success: false, entityLookupStatus: 'failed', error: result.error, contact: updated });
    }

    if (result.results.length === 0) {
      const updated = await prisma.mlsContact.update({
        where: { id: contact.id },
        data: { entityLookupStatus: 'not_found', entityLookupAt: new Date() },
      });
      return res.json({ success: false, entityLookupStatus: 'not_found', contact: updated });
    }

    if (result.results.length > 1) {
      const updated = await prisma.mlsContact.update({
        where: { id: contact.id },
        data: { entityLookupStatus: 'ambiguous', entityLookupAt: new Date() },
      });
      return res.json({ success: false, entityLookupStatus: 'ambiguous', candidates: result.results, contact: updated });
    }

    const match = result.results[0];
    const updated = await prisma.mlsContact.update({
      where: { id: contact.id },
      data: {
        mailingAddress: formatMailingAddress(match),
        entityTaxpayerNumber: match.taxpayerNumber,
        entityFileNumber: match.fileNumber,
        entityStatus: match.status,
        entityLookupAt: new Date(),
        entityLookupStatus: 'success',
      },
    });
    res.json({ success: true, entityLookupStatus: 'success', contact: updated });
  } catch (err) {
    console.error('[MLS] Entity lookup error:', err);
    const updated = await prisma.mlsContact.update({
      where: { id: contact.id },
      data: { entityLookupStatus: 'failed', entityLookupAt: new Date() },
    });
    res.status(500).json({ error: 'Entity lookup failed', entityLookupStatus: 'failed', contact: updated });
  }
});

module.exports = router;
