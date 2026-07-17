const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const orgAuth = require('../middleware/orgAuth');
const { requireRole } = orgAuth;
const { sendOrganizationInviteEmail } = require('../utils/mailer');

const ROLES = ['owner', 'admin', 'lawyer', 'paralegal'];

/**
 * @swagger
 * /api/organizations/me:
 *   get:
 *     tags: [Organizations]
 *     summary: Get the active organization and its members
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization with members
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/me', orgAuth, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT id, name, created_at FROM organizations WHERE id = $1', [req.organizationId]);
    const membersRes = await pool.query(
      `SELECT u.id as user_id, u.name, u.email, om.role, om.created_at as joined_at
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY om.created_at ASC`,
      [req.organizationId]
    );
    res.json({ ...orgRes.rows[0], role: req.role, members: membersRes.rows });
  } catch (err) {
    console.error('Get organization error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/organizations/mine:
 *   get:
 *     tags: [Organizations]
 *     summary: List every organization the current user belongs to
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations with the user's role in each
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/mine', orgAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.name, om.role, (o.id = $2) as is_active
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY o.name ASC`,
      [req.user.id, req.organizationId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List organizations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/organizations/switch:
 *   post:
 *     tags: [Organizations]
 *     summary: Switch the active organization
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organization_id]
 *             properties:
 *               organization_id: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Switched
 *       403:
 *         description: Not a member of that organization
 *       500:
 *         description: Server error
 */
router.post('/switch', orgAuth, [
  body('organization_id').isUUID().withMessage('organization_id must be a valid UUID'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const membership = await pool.query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [req.body.organization_id, req.user.id]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of that organization' });
    }
    await pool.query('UPDATE users SET active_organization_id = $1 WHERE id = $2', [req.body.organization_id, req.user.id]);
    res.json({ organization_id: req.body.organization_id, role: membership.rows[0].role });
  } catch (err) {
    console.error('Switch organization error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/organizations/invite:
 *   post:
 *     tags: [Organizations]
 *     summary: Invite an existing user to the active organization
 *     description: The invited user must already have a LegalTrack account. Owner/admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [owner, admin, lawyer, paralegal] }
 *     responses:
 *       201:
 *         description: Member added
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: No account exists for that email yet
 *       409:
 *         description: Already a member
 *       500:
 *         description: Server error
 */
router.post('/invite', orgAuth, requireRole('owner', 'admin'), [
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(ROLES).withMessage(`role must be one of ${ROLES.join(', ')}`),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, role } = req.body;

  try {
    const userRes = await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'No LegalTrack account exists for that email yet — ask them to sign up first' });
    }
    const invitedUser = userRes.rows[0];

    const existingMember = await pool.query(
      'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [req.organizationId, invitedUser.id]
    );
    if (existingMember.rows.length > 0) {
      return res.status(409).json({ error: 'This user is already a member of your organization' });
    }

    const orgRes = await pool.query('SELECT name FROM organizations WHERE id = $1', [req.organizationId]);

    await pool.query(
      'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)',
      [req.organizationId, invitedUser.id, role]
    );

    await sendOrganizationInviteEmail({
      to: email,
      inviteeName: invitedUser.name,
      organizationName: orgRes.rows[0].name,
      role,
    });

    res.status(201).json({ message: 'Member added', user_id: invitedUser.id, role });
  } catch (err) {
    console.error('Invite member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/organizations/members/{userId}:
 *   patch:
 *     tags: [Organizations]
 *     summary: Change a member's role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [owner, admin, lawyer, paralegal] }
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Cannot demote the last owner
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Member not found
 *       500:
 *         description: Server error
 */
router.patch('/members/:userId', orgAuth, requireRole('owner', 'admin'), [
  body('role').isIn(ROLES).withMessage(`role must be one of ${ROLES.join(', ')}`),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const target = await pool.query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [req.organizationId, req.params.userId]
    );
    if (target.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

    if (target.rows[0].role === 'owner' && req.body.role !== 'owner') {
      const ownerCount = await pool.query(
        `SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner'`,
        [req.organizationId]
      );
      if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last owner of the organization' });
      }
    }

    const result = await pool.query(
      'UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3 RETURNING *',
      [req.body.role, req.organizationId, req.params.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update member role error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/organizations/members/{userId}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Remove a member from the organization
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Member removed
 *       400:
 *         description: Cannot remove the last owner
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Member not found
 *       500:
 *         description: Server error
 */
router.delete('/members/:userId', orgAuth, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const target = await pool.query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [req.organizationId, req.params.userId]
    );
    if (target.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

    if (target.rows[0].role === 'owner') {
      const ownerCount = await pool.query(
        `SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner'`,
        [req.organizationId]
      );
      if (parseInt(ownerCount.rows[0].count, 10) <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last owner of the organization' });
      }
    }

    await pool.query('DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2', [req.organizationId, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
