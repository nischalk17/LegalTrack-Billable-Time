const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const entryValidation = [
  body('client').trim().notEmpty().withMessage('Client is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('date').isDate().withMessage('Valid date required'),
  body('duration_minutes').isInt({ min: 1 }).withMessage('Duration must be at least 1 minute'),
  body('matter').optional().trim(),
  body('source_type').optional().isIn(['manual', 'browser', 'desktop', 'suggestion']),
  body('notes').optional().trim(),
];

/**
 * @swagger
 * /api/entries:
 *   post:
 *     summary: Create a manual time entry
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - client
 *               - description
 *               - date
 *               - duration_minutes
 *             properties:
 *               client:
 *                 type: string
 *               matter:
 *                 type: string
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               duration_minutes:
 *                 type: integer
 *                 minimum: 1
 *               source_type:
 *                 type: string
 *                 enum: [manual, browser, desktop, suggestion]
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Entry created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
// POST /api/entries - Create manual entry
router.post('/', auth, entryValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { client, matter, description, date, duration_minutes, source_type = 'manual', notes } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO manual_entries (user_id, client, matter, description, date, duration_minutes, source_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [req.user.id, client, matter, description, date, duration_minutes, source_type, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/entries:
 *   get:
 *     summary: List all manual entries for user
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: List of entries
 *       500:
 *         description: Server error
 */
// GET /api/entries - List all entries for user
router.get('/', auth, async (req, res) => {
  const { client, date, limit = 50, offset = 0 } = req.query;
  let conditions = ['user_id = $1'];
  let params = [req.user.id];
  let idx = 2;

  if (client) {
    conditions.push(`client ILIKE $${idx++}`);
    params.push(`%${client}%`);
  }
  if (date) {
    conditions.push(`date = $${idx++}`);
    params.push(date);
  }

  params.push(parseInt(limit));
  params.push(parseInt(offset));

  try {
    const result = await pool.query(
      `SELECT * FROM manual_entries
       WHERE ${conditions.join(' AND ')}
       ORDER BY date DESC, created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM manual_entries WHERE ${conditions.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (err) {
    console.error('List entries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/entries/{id}:
 *   get:
 *     summary: Get a single manual entry
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Entry details
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */
// GET /api/entries/:id - Get single entry
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM manual_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/entries/{id}:
 *   put:
 *     summary: Update an existing manual entry
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - client
 *               - description
 *               - date
 *               - duration_minutes
 *             properties:
 *               client:
 *                 type: string
 *               matter:
 *                 type: string
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               duration_minutes:
 *                 type: integer
 *                 minimum: 1
 *               source_type:
 *                 type: string
 *                 enum: [manual, browser, desktop, suggestion]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Entry updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */
// PUT /api/entries/:id - Update entry
router.put('/:id', auth, entryValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { client, matter, description, date, duration_minutes, source_type, notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE manual_entries
       SET client=$1, matter=$2, description=$3, date=$4,
           duration_minutes=$5, source_type=$6, notes=$7, updated_at=NOW()
       WHERE id=$8 AND user_id=$9
       RETURNING *`,
      [client, matter, description, date, duration_minutes, source_type || 'manual', notes,
       req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/entries/{id}:
 *   delete:
 *     summary: Delete a manual entry
 *     tags: [Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Entry deleted successfully
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */
// DELETE /api/entries/:id - Delete entry
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM manual_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Entry deleted', id: req.params.id });
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
