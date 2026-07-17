const { body, param } = require('express-validator');

// A malformed UUID in a path param (e.g. GET /api/clients/not-a-uuid) would
// otherwise reach Postgres and throw "invalid input syntax for type uuid",
// which every route's generic catch block turns into a 500 — this should
// be a 400 instead, since it's a client error, not a server failure.
function idParam(name = 'id') {
  return param(name).isUUID().withMessage(`${name} must be a valid UUID`);
}

// pgcrypto's crypt() with gen_salt('bf') is bcrypt under the hood, which
// silently truncates at 72 bytes — capping input length here avoids that
// footgun rather than accepting a password whose tail is ignored.
function passwordValidator(field = 'password') {
  return body(field)
    .isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character');
}

// Unicode letters/marks, spaces, hyphens, apostrophes — collapses internal
// whitespace and rejects anything that's only whitespace after trimming.
const nameValidator = body('name')
  .trim()
  .customSanitizer((value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ') : value))
  .notEmpty().withMessage('Name is required')
  .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer')
  .matches(/^[\p{L}\p{M}' -]+$/u).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes');

module.exports = { passwordValidator, nameValidator, idParam };
