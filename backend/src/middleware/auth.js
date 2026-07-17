const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, name }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    // Never log the token or secret. err.name/message from jsonwebtoken (e.g.
    // "invalid signature", "jwt malformed") are safe, generic strings — but a
    // persistent flood of "invalid signature" across all requests is the
    // signature of a misconfigured/rotated JWT_SECRET, not routine bad tokens.
    console.error(`Auth failed: ${err.name} - ${err.message}`);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;
