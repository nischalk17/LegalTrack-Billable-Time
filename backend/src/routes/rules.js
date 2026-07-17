const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/orgAuth');
const { matchRules } = require('../utils/matchRules');
const { body, validationResult } = require('express-validator');
const { idParam } = require('../utils/validators');

const ruleValidation = [
  body('client_id').isUUID().withMessage('client_id must be a valid UUID'),
  body('matter').optional({ nullable: true }).trim().isLength({ max: 255 }),
  body('pattern').trim().notEmpty().withMessage('pattern is required').isLength({ max: 500 }),
  body('priority').optional().isInt().withMessage('priority must be an integer'),
];

/**
 * @swagger
 * /api/rules:
 *   get:
 *     tags: [Rules]
 *     summary: List tracking rules
 *     description: Returns all tracking rules for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of rules
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TrackingRule'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 *   post:
 *     tags: [Rules]
 *     summary: Create a tracking rule
 *     description: Creates a new tracking rule for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, rule_type, pattern, match_type]
 *             properties:
 *               client_id: { type: string, format: uuid }
 *               matter: { type: string, nullable: true }
 *               rule_type:
 *                 type: string
 *                 enum: [domain, app_name, window_title, file_extension]
 *               pattern: { type: string, example: "westlaw.com" }
 *               match_type:
 *                 type: string
 *                 enum: [exact, contains, starts_with]
 *                 example: "contains"
 *               priority: { type: integer, nullable: true, example: 10 }
 *           examples:
 *             domain:
 *               value:
 *                 client_id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                 rule_type: "domain"
 *                 pattern: "westlaw.com"
 *                 match_type: "contains"
 *                 priority: 10
 *     responses:
 *       201:
 *         description: Rule created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrackingRule'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missing:
 *                 value: { error: "client_id, rule_type, pattern, and match_type are required" }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// GET /api/rules
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, c.name as client_name
       FROM tracking_rules r
       JOIN clients c ON r.client_id = c.id
       WHERE r.organization_id = $1
       ORDER BY priority DESC, created_at DESC`,
      [req.organizationId]
    );
    res.json(rows);
  } catch (error) {
    console.error('List rules error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const RULE_TYPES = ['domain', 'app_name', 'window_title', 'file_extension'];
const MATCH_TYPES = ['exact', 'contains', 'starts_with'];

// POST /api/rules
router.post('/', auth, ruleValidation, async (req, res) => {
  const validation = validationResult(req);
  if (!validation.isEmpty()) return res.status(400).json({ errors: validation.array() });

  const { client_id, matter, rule_type, pattern, match_type, priority } = req.body;
  if (!rule_type || !match_type) {
    return res.status(400).json({ error: 'rule_type and match_type are required' });
  }
  if (!RULE_TYPES.includes(rule_type) || !MATCH_TYPES.includes(match_type)) {
    return res.status(400).json({ error: 'Invalid rule_type or match_type' });
  }
  try {
    const ownedClient = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND organization_id = $2',
      [client_id, req.organizationId]
    );
    if (ownedClient.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await pool.query(
      `INSERT INTO tracking_rules (user_id, organization_id, client_id, matter, rule_type, pattern, match_type, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, req.organizationId, client_id, matter || null, rule_type, pattern, match_type, priority || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/rules/{id}:
 *   put:
 *     tags: [Rules]
 *     summary: Update a tracking rule
 *     description: Updates an existing rule owned by the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Rule UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               client_id: { type: string, format: uuid }
 *               matter: { type: string, nullable: true }
 *               rule_type: { type: string, enum: [domain, app_name, window_title, file_extension] }
 *               pattern: { type: string }
 *               match_type: { type: string, enum: [exact, contains, starts_with] }
 *               priority: { type: integer }
 *     responses:
 *       200:
 *         description: Updated rule
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrackingRule'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Rule not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 *   delete:
 *     tags: [Rules]
 *     summary: Delete a tracking rule
 *     description: Deletes a rule owned by the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Rule UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Rule deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Rule deleted" }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Rule not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// PUT /api/rules/:id
router.put('/:id', auth, [
  idParam('id'),
  body('client_id').optional({ nullable: true }).isUUID().withMessage('client_id must be a valid UUID'),
  body('matter').optional({ nullable: true }).trim().isLength({ max: 255 }),
  body('pattern').optional().trim().isLength({ max: 500 }),
  body('priority').optional().isInt().withMessage('priority must be an integer'),
], async (req, res) => {
  const validation = validationResult(req);
  if (!validation.isEmpty()) return res.status(400).json({ errors: validation.array() });

  const { client_id, matter, rule_type, pattern, match_type, priority } = req.body;
  if (rule_type && !RULE_TYPES.includes(rule_type)) {
    return res.status(400).json({ error: 'Invalid rule_type' });
  }
  if (match_type && !MATCH_TYPES.includes(match_type)) {
    return res.status(400).json({ error: 'Invalid match_type' });
  }
  try {
    if (client_id) {
      const ownedClient = await pool.query(
        'SELECT id FROM clients WHERE id = $1 AND organization_id = $2',
        [client_id, req.organizationId]
      );
      if (ownedClient.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
    }

    const result = await pool.query(
      `UPDATE tracking_rules SET
        client_id = COALESCE($1, client_id),
        matter = COALESCE($2, matter),
        rule_type = COALESCE($3, rule_type),
        pattern = COALESCE($4, pattern),
        match_type = COALESCE($5, match_type),
        priority = COALESCE($6, priority)
       WHERE id = $7 AND organization_id = $8 RETURNING *`,
      [client_id, matter, rule_type, pattern, match_type, priority, req.params.id, req.organizationId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/rules/:id
router.delete('/:id', auth, [idParam('id')], async (req, res) => {
  const paramErrors = validationResult(req);
  if (!paramErrors.isEmpty()) return res.status(400).json({ errors: paramErrors.array() });
  try {
    const result = await pool.query(
      'DELETE FROM tracking_rules WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.organizationId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/rules/test
/**
 * @swagger
 * /api/rules/test:
 *   post:
 *     tags: [Rules]
 *     summary: Test tracking rules against an activity payload
 *     description: Evaluates the provided activity-like payload against saved rules and returns the matched rule if any.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source_type: { type: string, enum: [browser, desktop] }
 *               app_name: { type: string, nullable: true }
 *               window_title: { type: string, nullable: true }
 *               domain: { type: string, nullable: true }
 *               file_name: { type: string, nullable: true }
 *               url: { type: string, nullable: true }
 *           examples:
 *             test:
 *               value:
 *                 source_type: "browser"
 *                 domain: "westlaw.com"
 *                 window_title: "Westlaw - Search Results"
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 match: { type: boolean, example: true }
 *                 rule:
 *                   anyOf:
 *                     - $ref: '#/components/schemas/TrackingRule'
 *                     - type: 'null'
 *                 client_name: { type: string, nullable: true }
 *                 matter: { type: string, nullable: true }
 *             examples:
 *               matched:
 *                 value:
 *                   match: true
 *                   rule:
 *                     id: "5e4c2f9a-5d2e-4b28-9c62-1c2b6b9b2e2a"
 *                     client_id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                     rule_type: "domain"
 *                     pattern: "westlaw.com"
 *                     match_type: "contains"
 *                     priority: 10
 *                   client_name: "Acme Corp"
 *                   matter: "Contract Review"
 *               notMatched:
 *                 value: { match: false, rule: null }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/test', auth, async (req, res) => {
  const activity = req.body;
  try {
    const rulesRes = await pool.query(
      `SELECT r.*, c.name as client_name
       FROM tracking_rules r
       JOIN clients c ON r.client_id = c.id
       WHERE r.organization_id = $1
       ORDER BY priority DESC, created_at DESC`,
      [req.organizationId]
    );
    const rules = rulesRes.rows;
    const match = matchRules(activity, rules);
    
    if (match) {
      res.json({ match: true, rule: match, client_name: match.client_name, matter: match.matter });
    } else {
      res.json({ match: false, rule: null });
    }
  } catch (error) {
    console.error('Test rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
