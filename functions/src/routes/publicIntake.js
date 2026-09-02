/**
 * Public Lead Intake
 *
 * The only route in this app that accepts traffic from anyone —
 * `POST /submissions` is unauthenticated, reached by the four funnel pages
 * (sell-property, distressed-property, inherited-property, landlord-help) on
 * the public marketing site (rauljr10980/estate-essentials-co, deployed as
 * the `public-site` Railway service). Everything else here (list + update)
 * is behind `authenticateToken`, same as the rest of the app.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { isValidSourcePage, isHoneypotTriggered, hasContactMethod, hashIp } = require('../lib/publicIntake');

// Far tighter than the app-wide 1000/15min limiter in index.js — this route
// alone takes traffic from anyone on the internet, so it gets its own,
// much narrower budget. A handful of genuine submissions per visitor per 15
// minutes is plenty; anything past that is a script.
const publicSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this address. Please try again later.' },
});

// ============================================================================
// PUBLIC — unauthenticated
// ============================================================================

router.post('/submissions',
  publicSubmissionLimiter,
  [
    body('name').trim().isLength({ min: 1, max: 120 }).withMessage('Name is required'),
    body('email').trim().optional({ checkFalsy: true }).isEmail().withMessage('A valid email is required'),
    body('phone').trim().optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage('Phone number is too long'),
    body('propertyAddress').trim().optional({ checkFalsy: true }).isLength({ max: 300 }).withMessage('Address is too long'),
    body('message').trim().optional({ checkFalsy: true }).isLength({ max: 4000 }).withMessage('Message is too long'),
    body('sourcePage').custom((value) => isValidSourcePage(value)).withMessage('Unrecognized source page'),
  ],
  async (req, res) => {
    // Honeypot first, ahead of validation: `website` is a field a real form
    // leaves empty and CSS-hides. Any value at all means a bot filled it in —
    // hand back the same 200 a genuine submission gets (so it stops
    // retrying) and store nothing, regardless of whether the rest of the
    // body would have validated.
    if (isHoneypotTriggered(req.body.website)) {
      return res.status(200).json({ ok: true });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { name, email = '', phone = '', propertyAddress = '', message = '', sourcePage } = req.body;

    // A submission we cannot reply to is not a lead.
    if (!hasContactMethod({ email, phone })) {
      return res.status(400).json({ error: 'An email or phone number is required' });
    }

    try {
      await prisma.publicSubmission.create({
        data: {
          sourcePage,
          name: String(name).trim(),
          email: String(email).trim(),
          phone: String(phone).trim(),
          propertyAddress: String(propertyAddress).trim(),
          message: String(message).trim(),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
          // Salted hash only — never the raw IP. See functions/src/lib/publicIntake.js.
          ipHash: hashIp(req.ip),
        },
      });

      // 201 and nothing else — a public endpoint must not become a way to
      // read back what was just stored.
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[public-intake] submission error:', err);
      res.status(500).json({ error: 'Submission failed' });
    }
  }
);

// ============================================================================
// AUTHENTICATED — CRM (Inbox tab)
// ============================================================================

router.use(authenticateToken);

router.get('/submissions', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const where = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.sourcePage) where.sourcePage = String(req.query.sourcePage);

  const [total, items] = await Promise.all([
    prisma.publicSubmission.count({ where }),
    prisma.publicSubmission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

router.patch('/submissions/:id', async (req, res) => {
  const allowed = ['status', 'notes'];
  const data = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) data[key] = req.body[key];
  }
  const result = await prisma.publicSubmission.updateMany({ where: { id: req.params.id }, data });
  if (!result.count) return res.status(404).json({ error: 'Submission not found' });
  res.json({ ok: true });
});

module.exports = router;
