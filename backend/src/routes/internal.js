const router = require('express').Router();
const crypto = require('crypto');
const { runAutoBilling } = require('../jobs/autoBilling');

/**
 * Endpoints meant to be hit by an external scheduler (e.g. a GitHub Actions
 * cron workflow) rather than a browser — free-tier hosts like Render put
 * services to sleep when idle, so an in-process node-cron timer can't be
 * relied on to fire at the right time. An external ping both wakes the
 * service and triggers the job, on one schedule, in one place.
 */

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireInternalSecret(req, res, next) {
  const configured = process.env.INTERNAL_CRON_SECRET;
  if (!configured) {
    console.error('INTERNAL_CRON_SECRET is not set — refusing internal trigger request');
    return res.status(503).json({ error: 'Internal trigger not configured' });
  }
  const provided = req.headers['x-internal-secret'];
  if (!provided || !timingSafeEqual(provided, configured)) {
    return res.status(401).json({ error: 'Invalid or missing internal secret' });
  }
  next();
}

/**
 * @swagger
 * /api/internal/run-auto-billing:
 *   post:
 *     tags: [Internal]
 *     summary: Trigger the monthly auto-billing job on demand
 *     description: Requires the X-Internal-Secret header to match INTERNAL_CRON_SECRET. Meant for an external scheduler, not browser/UI use.
 *     parameters:
 *       - in: header
 *         name: X-Internal-Secret
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job completed
 *       401:
 *         description: Invalid or missing internal secret
 *       503:
 *         description: INTERNAL_CRON_SECRET not configured on this server
 */
router.post('/run-auto-billing', requireInternalSecret, async (req, res) => {
  try {
    await runAutoBilling();
    res.json({ message: 'Auto-billing run completed' });
  } catch (err) {
    console.error('Manual auto-billing trigger failed:', err);
    res.status(500).json({ error: 'Auto-billing run failed' });
  }
});

module.exports = router;
