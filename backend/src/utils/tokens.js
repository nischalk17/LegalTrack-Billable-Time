const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_COOKIE_NAME = 'refresh_token';

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issues a new refresh token for a user, storing only its hash. Returns the
 * raw token (only ever handed to the client via an httpOnly cookie, never
 * persisted anywhere in plaintext).
 */
async function issueRefreshToken(dbClient, userId) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await dbClient.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(rawToken), expiresAt]
  );
  return rawToken;
}

/**
 * Looks up an unexpired, unrevoked refresh token by its raw value.
 * Returns the row (with user_id) or null.
 */
async function findValidRefreshToken(dbClient, rawToken) {
  const result = await dbClient.query(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [hashToken(rawToken)]
  );
  return result.rows[0] || null;
}

async function revokeRefreshTokenById(dbClient, id) {
  await dbClient.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [id]);
}

/**
 * Revokes every active refresh token for a user — used on password
 * change/reset so a stolen refresh token can't keep minting new access
 * tokens after the user has secured their account. Any already-issued
 * access token still naturally expires within ACCESS_TOKEN_TTL regardless.
 */
async function revokeAllRefreshTokensForUser(dbClient, userId) {
  await dbClient.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Frontend (Vercel) and backend (Render) are different origins, so the
  // cookie must be sendable cross-site — requires SameSite=None, which in
  // turn requires Secure (browsers reject None without Secure).
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
  signAccessToken,
  issueRefreshToken,
  findValidRefreshToken,
  revokeRefreshTokenById,
  revokeAllRefreshTokensForUser,
};
