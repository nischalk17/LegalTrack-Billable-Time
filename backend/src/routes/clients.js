const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const clientValidation = [
  body('name').trim().notEmpty().withMessage('Client name is required'),
  body('contact_person').optional({ nullable: true }).trim(),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('phone').optional({ nullable: true }).trim(),
  body('address').optional({ nullable: true }).trim(),
  body('pan_number').optional({ nullable: true }).trim(),
  body('default_hourly_rate').optional().isInt({ min: 0 }),
  body('is_vat_applicable').optional().isBoolean(),
  body('notes').optional({ nullable: true }).trim(),
];

/**
 * @swagger
 * /api/clients:
 *   get:
 *     tags: [Clients]
 *     summary: List clients
 *     description: Returns all clients belonging to the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of clients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Client'
 *             examples:
 *               example:
 *                 value:
 *                   - id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                     user_id: "b3b2a2f0-0c7b-4c86-8c2c-0b7c9f0f3f7a"
 *                     name: "Acme Corp"
 *                     contact_person: "Alex Doe"
 *                     email: "alex@acme.com"
 *                     phone: "+977-9800000000"
 *                     address: null
 *                     pan_number: "123456789"
 *                     default_hourly_rate: 5000
 *                     is_vat_applicable: true
 *                     notes: null
 *                     created_at: "2026-03-16T10:00:00.000Z"
 *                     updated_at: "2026-03-16T10:00:00.000Z"
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
 *     tags: [Clients]
 *     summary: Create a client
 *     description: Creates a new client for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Acme Corp" }
 *               contact_person: { type: string, nullable: true, example: "Alex Doe" }
 *               email: { type: string, format: email, nullable: true, example: "alex@acme.com" }
 *               phone: { type: string, nullable: true, example: "+977-9800000000" }
 *               address: { type: string, nullable: true, example: "Kathmandu, Nepal" }
 *               pan_number: { type: string, nullable: true, example: "123456789" }
 *               default_hourly_rate: { type: integer, minimum: 0, example: 5000 }
 *               is_vat_applicable: { type: boolean, example: true }
 *               notes: { type: string, nullable: true, example: "Primary contact is Alex." }
 *           examples:
 *             create:
 *               value:
 *                 name: "Acme Corp"
 *                 contact_person: "Alex Doe"
 *                 email: "alex@acme.com"
 *                 default_hourly_rate: 5000
 *                 is_vat_applicable: true
 *     responses:
 *       201:
 *         description: Created client
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// GET /api/clients - List all clients for user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clients WHERE user_id = $1 ORDER BY name ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List clients err:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/clients/{id}:
 *   get:
 *     tags: [Clients]
 *     summary: Get a client
 *     description: Returns a single client (owned by the user) along with total billed amount for non-draft bills.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Client UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Client with totals
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientWithTotals'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Client not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               notFound:
 *                 value: { error: "Client not found" }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 *   put:
 *     tags: [Clients]
 *     summary: Update a client
 *     description: Updates an existing client owned by the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Client UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               contact_person: { type: string, nullable: true }
 *               email: { type: string, format: email, nullable: true }
 *               phone: { type: string, nullable: true }
 *               address: { type: string, nullable: true }
 *               pan_number: { type: string, nullable: true }
 *               default_hourly_rate: { type: integer, minimum: 0 }
 *               is_vat_applicable: { type: boolean }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Updated client
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Client not found
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
 *     tags: [Clients]
 *     summary: Delete a client
 *     description: Deletes a client owned by the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Client UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Client deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Client deleted" }
 *                 id: { type: string, format: uuid }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Client not found
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

// GET /api/clients/:id - Get single client with total billed amount
router.get('/:id', auth, async (req, res) => {
  try {
    const clientRes = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientRes.rows[0];

    // Get total billed
    const billRes = await pool.query(
      `SELECT SUM(total_npr) as total_billed FROM bills WHERE client_id = $1 AND status != 'draft'`,
      [client.id]
    );

    res.json({
      ...client,
      total_billed: parseInt(billRes.rows[0].total_billed || '0', 10)
    });
  } catch (err) {
    console.error('Get client err:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients - Create client
router.post('/', auth, clientValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    name, contact_person, email, phone, address, pan_number, 
    default_hourly_rate = 5000, is_vat_applicable = true, notes
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (
        user_id, name, contact_person, email, phone, address, 
        pan_number, default_hourly_rate, is_vat_applicable, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, name, contact_person, email, phone, address, pan_number, default_hourly_rate, is_vat_applicable, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create client err:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/:id - Update client
router.put('/:id', auth, clientValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    name, contact_person, email, phone, address, pan_number, 
    default_hourly_rate, is_vat_applicable, notes
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        contact_person = COALESCE($2, contact_person),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        address = COALESCE($5, address),
        pan_number = COALESCE($6, pan_number),
        default_hourly_rate = COALESCE($7, default_hourly_rate),
        is_vat_applicable = COALESCE($8, is_vat_applicable),
        notes = COALESCE($9, notes),
        updated_at = NOW()
       WHERE id = $10 AND user_id = $11 RETURNING *`,
      [name, contact_person, email, phone, address, pan_number, default_hourly_rate, is_vat_applicable, notes, req.params.id, req.user.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update client err:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted', id: rows[0].id });
  } catch (err) {
    console.error('Delete client err:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
