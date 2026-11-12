const express = require('express');
const { createAppointment } = require('../lib/appointments');

function createAppointmentsRouter({ db, authenticate, writers } = {}) {
  db ??= require('../lib/prisma');
  if (!authenticate || !writers) {
    const { authenticateToken, requireRole } = require('../middleware/auth');
    authenticate ??= authenticateToken;
    writers ??= requireRole('ADMIN', 'OPERATOR');
  }
  const router = express.Router();
  router.post('/', authenticate, writers, async (req, res) => {
    try { res.status(201).json(await createAppointment(db, req.user, req.body)); }
    catch (error) {
      // A concurrent retry may have committed the same idempotency key.
      if (error.code === 'P2002') return res.status(409).json({ error: 'This scheduling request is already being saved. Retry to retrieve it.' });
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save the appointment. Please try again.' });
    }
  });
  return router;
}
module.exports = { createAppointmentsRouter };
