const router = require('express').Router();
// bcrypt removed in favor of pgcrypto
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { passwordValidator, nameValidator } = require('../utils/validators');
const { sendPasswordResetEmail } = require('../utils/mailer');
const {
  signAccessToken, issueRefreshToken, findValidRefreshToken,
  revokeRefreshTokenById, revokeAllRefreshTokensForUser,
  REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS,
} = require('../utils/tokens');

/**
 * Signs an access token and issues+sets a refresh token cookie for a user.
 * Shared by register/login/reset-password so all three grant a full session
 * the same way.
 */
async function issueSession(dbClient, res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(dbClient, user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account and returns a JWT for authentication.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 72
 *                 description: Must contain at least one uppercase letter, one number, and one special character.
 *               name:
 *                 type: string
 *           examples:
 *             register:
 *               value:
 *                 email: "demo@legaltrack.com"
 *                 password: "Demo1234!"
 *                 name: "Demo Lawyer"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               conflict:
 *                 value: { error: "Email already registered" }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  passwordValidator('password'),
  nameValidator,
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, name } = req.body;

  const dbClient = await pool.connect();
  try {
    const existing = await dbClient.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    await dbClient.query('BEGIN');

    const result = await dbClient.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, crypt($3, gen_salt(\'bf\'))) RETURNING id, email, name, created_at',
      [email, name, password]
    );
    const user = result.rows[0];

    // Every new user gets a personal organization (owner role) — this is
    // what lets a solo lawyer's usage stay unchanged while also supporting
    // being invited into other firms' organizations later.
    const orgResult = await dbClient.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [`${name}'s Organization`]
    );
    const organizationId = orgResult.rows[0].id;

    await dbClient.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [organizationId, user.id]
    );
    await dbClient.query('UPDATE users SET active_organization_id = $1 WHERE id = $2', [organizationId, user.id]);

    const accessToken = await issueSession(dbClient, res, user);

    await dbClient.query('COMMIT');

    res.status(201).json({ token: accessToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    dbClient.release();
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     description: Validates credentials and returns a JWT for authentication.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *           examples:
 *             login:
 *               value:
 *                 email: "demo@legaltrack.com"
 *                 password: "demo1234"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalid:
 *                 value: { error: "Invalid credentials" }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, name FROM users WHERE email = $1 AND password_hash = crypt($2, password_hash)',
      [email, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    const accessToken = await issueSession(pool, res, user);

    res.json({ token: accessToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const RESET_CODE_TTL_MINUTES = 10;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, no leading zero
}

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset code
 *     description: Always responds 200 regardless of whether the email is registered, to avoid leaking account existence. Emails a 6-digit OTP if it is.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: If an account exists for that email, a reset code was sent
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;
  const genericResponse = { message: 'If an account exists for that email, a reset code has been sent.' };

  try {
    const userRes = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.json(genericResponse);
    }
    const user = userRes.rows[0];

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);
    await pool.query(
      'INSERT INTO password_reset_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
      [user.id, otp, expiresAt]
    );

    await sendPasswordResetEmail({ to: user.email, name: user.name, otp });

    res.json(genericResponse);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using an OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, new_password]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, example: "123456" }
 *               new_password: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired code
 *       500:
 *         description: Server error
 */
router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('otp must be a 6-digit code'),
  passwordValidator('new_password'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, otp, new_password } = req.body;

  const dbClient = await pool.connect();
  try {
    const userRes = await dbClient.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }
    const userId = userRes.rows[0].id;

    await dbClient.query('BEGIN');

    const codeRes = await dbClient.query(
      `SELECT id FROM password_reset_codes
       WHERE user_id = $1 AND code = $2 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId, otp]
    );
    if (codeRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    await dbClient.query('UPDATE password_reset_codes SET used_at = NOW() WHERE id = $1', [codeRes.rows[0].id]);
    await dbClient.query(
      `UPDATE users SET password_hash = crypt($1, gen_salt('bf')), updated_at = NOW() WHERE id = $2`,
      [new_password, userId]
    );
    // Any refresh token issued before this reset must stop working — the
    // whole point of a security-motivated reset is invalidated otherwise.
    // Already-issued access tokens still die naturally within 15 minutes.
    await revokeAllRefreshTokensForUser(dbClient, userId);

    await dbClient.query('COMMIT');
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    dbClient.release();
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Exchange the refresh-token cookie for a new access token
 *     description: Rotates the refresh token (old one is revoked, a new one issued) on every use.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Missing, invalid, or expired refresh token
 *       500:
 *         description: Server error
 */
router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawToken) return res.status(401).json({ error: 'No refresh token' });

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const tokenRow = await findValidRefreshToken(dbClient, rawToken);
    if (!tokenRow) {
      await dbClient.query('ROLLBACK');
      res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const userRes = await dbClient.query('SELECT id, email, name FROM users WHERE id = $1', [tokenRow.user_id]);
    if (userRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const user = userRes.rows[0];

    // Rotate: revoke the one just used, issue a fresh one. Limits how long
    // a stolen-but-not-yet-used refresh token stays valid, and makes reuse
    // of an already-rotated token detectable (it'll simply no longer match
    // an active row).
    await revokeRefreshTokenById(dbClient, tokenRow.id);
    const accessToken = await issueSession(dbClient, res, user);

    await dbClient.query('COMMIT');
    res.json({ token: accessToken });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Refresh token error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    dbClient.release();
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Revoke the current refresh token and clear its cookie
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  try {
    if (rawToken) {
      const tokenRow = await findValidRefreshToken(pool, rawToken);
      if (tokenRow) await revokeRefreshTokenById(pool, tokenRow.id);
    }
  } catch (err) {
    console.error('Logout error:', err);
    // Still clear the cookie client-side even if revocation failed server-side.
  }
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  res.json({ message: 'Logged out' });
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change the current user's password
 *     description: Requires the current password. Revokes all other active sessions (refresh tokens) on success.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password: { type: string }
 *               new_password: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Current password is incorrect
 *       500:
 *         description: Server error
 */
router.post('/change-password', require('../middleware/auth'), [
  body('current_password').notEmpty(),
  passwordValidator('new_password'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { current_password, new_password } = req.body;

  const dbClient = await pool.connect();
  try {
    const userRes = await dbClient.query(
      'SELECT id FROM users WHERE id = $1 AND password_hash = crypt($2, password_hash)',
      [req.user.id, current_password]
    );
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await dbClient.query('BEGIN');
    await dbClient.query(
      `UPDATE users SET password_hash = crypt($1, gen_salt('bf')), updated_at = NOW() WHERE id = $2`,
      [new_password, req.user.id]
    );
    await revokeAllRefreshTokensForUser(dbClient, req.user.id);
    await dbClient.query('COMMIT');

    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    res.json({ message: 'Password changed. Please log in again.' });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    dbClient.release();
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     description: Returns the current user based on the Bearer JWT.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *             examples:
 *               me:
 *                 value:
 *                   id: "b3b2a2f0-0c7b-4c86-8c2c-0b7c9f0f3f7a"
 *                   email: "demo@legaltrack.com"
 *                   name: "Demo Lawyer"
 *                   created_at: "2026-03-16T10:00:00.000Z"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
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
// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.created_at,
              om.organization_id, om.role, o.name as organization_name
       FROM users u
       LEFT JOIN organization_members om ON om.organization_id = u.active_organization_id AND om.user_id = u.id
       LEFT JOIN organizations o ON o.id = om.organization_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
