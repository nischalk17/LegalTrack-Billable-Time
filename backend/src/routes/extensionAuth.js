const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const CODE_TTL_MINUTES = 5;

function generateCode() {
  // 8-char alphanumeric, easy to type into the extension popup
  return crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
}

/**
 * @swagger
 * /api/auth/pair/start:
 *   post:
 *     summary: Start a browser-extension pairing session
 *     description: Generates a short-lived code the user types into the extension to obtain its own token.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Pairing code generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: string, example: "A1B2C3D4" }
 *                 expires_at: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// POST /api/auth/pair/start
router.post('/start', auth, async (req, res) => {
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO extension_pairing_codes (user_id, code, expires_at)
       VALUES ($1, $2, $3) RETURNING code, expires_at`,
      [req.user.id, code, expiresAt]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Pairing start error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/auth/pair/exchange:
 *   post:
 *     summary: Exchange a pairing code for a JWT
 *     description: Called by the browser extension to redeem a pairing code shown in the web app.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: "A1B2C3D4" }
 *     responses:
 *       200:
 *         description: Pairing successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: code is required
 *       404:
 *         description: Invalid, expired, or already-used code
 *       500:
 *         description: Server error
 */
// POST /api/auth/pair/exchange
router.post('/exchange', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const pairingRes = await dbClient.query(
      `SELECT * FROM extension_pairing_codes
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [code.toUpperCase()]
    );

    if (pairingRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Invalid or expired code' });
    }

    const pairing = pairingRes.rows[0];
    await dbClient.query('UPDATE extension_pairing_codes SET used_at = NOW() WHERE id = $1', [pairing.id]);

    const userRes = await dbClient.query('SELECT id, email, name FROM users WHERE id = $1', [pairing.user_id]);
    if (userRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    await dbClient.query('COMMIT');

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token, user });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Pairing exchange error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    dbClient.release();
  }
});

module.exports = router;
