const auth = require('./auth');
const pool = require('../db/pool');

/**
 * Resolves the requesting user's active organization + role within it.
 * Must run after `auth` (relies on req.user.id). Attaches req.organizationId
 * and req.role, or 403s if the user has no active organization / isn't a
 * member of it (should only happen for pre-migration edge cases).
 */
async function resolveOrg(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT om.organization_id, om.role
       FROM users u
       JOIN organization_members om ON om.organization_id = u.active_organization_id AND om.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'No active organization for this user' });
    }

    req.organizationId = result.rows[0].organization_id;
    req.role = result.rows[0].role;
    next();
  } catch (err) {
    console.error('Org resolution error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Route files use this in place of `../middleware/auth` — Express accepts an
// array of middleware as a single handler argument, so every existing
// `router.get('/', auth, handler)` call site keeps working unchanged while
// now also getting organization resolution.
module.exports = [auth, resolveOrg];
module.exports.resolveOrg = resolveOrg;

/**
 * Route-level guard: only allow members with one of the given roles.
 * Must run after the exported [auth, resolveOrg] pair (needs req.role).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports.requireRole = requireRole;
