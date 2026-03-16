require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 4000;

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
 *             examples:
 *               ok:
 *                 value: { status: "ok", timestamp: "2026-03-16T10:00:00.000Z", version: "1.0.0" }
 */

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ── Swagger UI ─────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// ── Routes ────────────────────────────────────────────────────
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

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
