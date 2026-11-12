// MLS pilot access is tied to the authenticated account, not a request body
// or a client-supplied view-as header. Existing per-user data scoping remains.
function requireMlsAccess(req, res, next) {
  if (req.user?.username !== 'test') return res.status(403).json({ error: 'Custom MLS Leads is available only to the test account.' });
  next();
}
module.exports = { requireMlsAccess };
