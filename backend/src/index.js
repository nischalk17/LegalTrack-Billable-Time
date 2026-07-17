require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined in the environment.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

/**
 * @swagger
 * /api/health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Returns basic service status information.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 timestamp: { type: string, format: date-time }
 *                 version: { type: string, example: "1.0.0" }
 */

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting (auth endpoints) ──────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ── Swagger UI ───────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/activities',  require('./routes/activities'));
app.use('/api/entries',     require('./routes/entries'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/clients',     require('./routes/clients'));
app.use('/api/bills',       require('./routes/bills'));
app.use('/api/rules',       require('./routes/rules'));
app.use('/api/sessions',    require('./routes/sessions'));
app.use('/api/analytics',   require('./routes/analytics'));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server (Railway FIX here) ──────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📡 Health endpoint: /api/health`);
});