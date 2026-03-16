const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// POST /api/sessions/start
/**
 * @swagger
 * /api/sessions/start:
 *   post:
 *     tags: [Sessions]
 *     summary: Start a session
 *     description: Starts a new active session for a client (and optional matter). Any existing active session is ended.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id]
 *             properties:
 *               client_id: { type: string, format: uuid }
 *               matter: { type: string, nullable: true }
 *           examples:
 *             start:
 *               value:
 *                 client_id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                 matter: "Contract Review"
 *     responses:
 *       201:
 *         description: Session started
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ActiveSession'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missing:
 *                 value: { error: "client_id is required" }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/start', auth, async (req, res) => {
  const { client_id, matter } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // End any currently active session
    await client.query(
      `UPDATE active_sessions SET ended_at = NOW(), is_active = false 
       WHERE user_id = $1 AND is_active = true`,
      [req.user.id]
    );

    // Start new session
    const result = await client.query(
      `INSERT INTO active_sessions (user_id, client_id, matter) 
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, client_id, matter || null]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/sessions/end
/**
 * @swagger
 * /api/sessions/end:
 *   post:
 *     tags: [Sessions]
 *     summary: End the active session
 *     description: Ends the current active session for the authenticated user (if any).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session ended or none was active
 *         content:
 *           application/json:
 *             schema:
 *               anyOf:
 *                 - $ref: '#/components/schemas/ActiveSession'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: "No active session found" }
 *             examples:
 *               ended:
 *                 value:
 *                   id: "7f3a9d6b-7c2c-4f2b-b3a5-2e2a9b6c1d11"
 *                   user_id: "b3b2a2f0-0c7b-4c86-8c2c-0b7c9f0f3f7a"
 *                   client_id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                   matter: "Contract Review"
 *                   started_at: "2026-03-16T09:00:00.000Z"
 *                   ended_at: "2026-03-16T10:00:00.000Z"
 *                   is_active: false
 *               none:
 *                 value: { message: "No active session found" }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/end', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE active_sessions SET ended_at = NOW(), is_active = false 
       WHERE user_id = $1 AND is_active = true RETURNING *`,
      [req.user.id]
    );
    res.json(result.rows[0] || { message: 'No active session found' });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sessions/active
/**
 * @swagger
 * /api/sessions/active:
 *   get:
 *     tags: [Sessions]
 *     summary: Get active session
 *     description: Returns the current active session for the authenticated user, or null if none.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active session or null
 *         content:
 *           application/json:
 *             schema:
 *               anyOf:
 *                 - $ref: '#/components/schemas/ActiveSession'
 *                 - type: 'null'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/active', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, c.name as client_name 
       FROM active_sessions s
       JOIN clients c ON s.client_id = c.id
       WHERE s.user_id = $1 AND s.is_active = true 
       LIMIT 1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
