const express = require('express');

function createPropertyLabelsRouter({ db, authenticate, writers } = {}) {
  db ??= require('../lib/prisma');
  if (!authenticate || !writers) {
    const { authenticateToken, requireRole } = require('../middleware/auth');
    authenticate ??= authenticateToken;
    writers ??= requireRole('ADMIN', 'OPERATOR');
  }
  const router = express.Router();
  router.patch('/llc', authenticate, writers, async (req, res) => {
    const { type, id, ownerIsLlc } = req.body ?? {};
    if (!['property', 'preforeclosure', 'driving'].includes(type) || typeof id !== 'string' || !id.trim() || id.length > 200 || typeof ownerIsLlc !== 'boolean') return res.status(400).json({ error: 'Supply a property and an LLC label.' });
    const model = type === 'property' ? db.property : type === 'preforeclosure' ? db.preForeclosure : db.drivingLead;
    try {
      const result = await model.update({ where: type === 'preforeclosure' ? { documentNumber: id } : { id }, data: { ownerIsLlc }, select: { ownerIsLlc: true } });
      res.json(result);
    } catch (error) {
      res.status(error.code === 'P2025' ? 404 : 500).json({ error: error.code === 'P2025' ? 'Property not found.' : 'Could not save the LLC label.' });
    }
  });
  return router;
}
module.exports = { createPropertyLabelsRouter };
