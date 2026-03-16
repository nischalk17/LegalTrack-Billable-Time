const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/analytics/daily:
 *   get:
 *     tags: [Analytics]
 *     summary: Daily analytics
 *     description: Returns hour-by-hour activity, source split, top apps, and totals for a specific date.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         description: Target date (YYYY-MM-DD). Defaults to today.
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Daily analytics payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hours_by_hour:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       hour: { type: integer, example: 9 }
 *                       minutes: { type: number, example: 45 }
 *                 source_split:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       source_type: { type: string, enum: [browser, desktop] }
 *                       minutes: { type: number, example: 120 }
 *                 top_apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       app_name: { type: string, example: "Chrome" }
 *                       minutes: { type: number, example: 90 }
 *                 total_minutes: { type: integer, example: 240 }
 *                 untagged_minutes: { type: integer, example: 30 }
 *             examples:
 *               example:
 *                 value:
 *                   hours_by_hour: [{ hour: 9, minutes: 30 }, { hour: 10, minutes: 60 }]
 *                   source_split: [{ source_type: browser, minutes: 120 }, { source_type: desktop, minutes: 60 }]
 *                   top_apps: [{ app_name: "Chrome", minutes: 90 }]
 *                   total_minutes: 180
 *                   untagged_minutes: 15
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/daily', auth, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    // 1. Hours by Hour
    const hoursByHour = await pool.query(
      `SELECT EXTRACT(HOUR FROM start_time) as hour,
              ROUND(SUM(duration_seconds) / 60.0) as minutes
       FROM tracked_activities
       WHERE user_id = $1 AND DATE(start_time) = $2
       GROUP BY hour ORDER BY hour`,
      [req.user.id, targetDate]
    );

    // 2. Source Split
    const sourceSplit = await pool.query(
      `SELECT source_type, ROUND(SUM(duration_seconds) / 60.0) as minutes
       FROM tracked_activities
       WHERE user_id = $1 AND DATE(start_time) = $2
       GROUP BY source_type`,
      [req.user.id, targetDate]
    );

    // 3. Top Apps
    const topApps = await pool.query(
      `SELECT app_name, ROUND(SUM(duration_seconds) / 60.0) as minutes
       FROM tracked_activities
       WHERE user_id = $1 AND DATE(start_time) = $2 AND app_name IS NOT NULL
       GROUP BY app_name
       ORDER BY minutes DESC
       LIMIT 5`,
      [req.user.id, targetDate]
    );

    // 4. Totals
    const totals = await pool.query(
      `SELECT 
         SUM(duration_seconds) as total_seconds,
         SUM(CASE WHEN client_id IS NULL THEN duration_seconds ELSE 0 END) as untagged_seconds
       FROM tracked_activities
       WHERE user_id = $1 AND DATE(start_time) = $2`,
      [req.user.id, targetDate]
    );

    res.json({
      hours_by_hour: hoursByHour.rows.map(r => ({ hour: parseInt(r.hour), minutes: parseFloat(r.minutes) })),
      source_split: sourceSplit.rows.map(r => ({ source_type: r.source_type, minutes: parseFloat(r.minutes) })),
      top_apps: topApps.rows.map(r => ({ app_name: r.app_name, minutes: parseFloat(r.minutes) })),
      total_minutes: Math.round((totals.rows[0].total_seconds || 0) / 60),
      untagged_minutes: Math.round((totals.rows[0].untagged_seconds || 0) / 60)
    });
  } catch (err) {
    console.error('Daily analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/analytics/clients:
 *   get:
 *     tags: [Analytics]
 *     summary: Client analytics
 *     description: Returns total minutes (tracked + manual) and approximate revenue by client for a date range.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         description: Start date (YYYY-MM-DD). Defaults to first day of current month.
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         description: End date (YYYY-MM-DD). Defaults to today.
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Client analytics payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 by_client:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       client_id: { type: string, format: uuid }
 *                       client_name: { type: string }
 *                       tracked_minutes: { type: number }
 *                       manual_minutes: { type: number }
 *                       total_minutes: { type: number }
 *                       amount_npr: { type: number }
 *                 untagged_minutes: { type: number }
 *                 total_amount_npr: { type: number }
 *             examples:
 *               example:
 *                 value:
 *                   by_client:
 *                     - client_id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                       client_name: "Acme Corp"
 *                       tracked_minutes: 120
 *                       manual_minutes: 60
 *                       total_minutes: 180
 *                       amount_npr: 15000
 *                   untagged_minutes: 30
 *                   total_amount_npr: 15000
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/clients', auth, async (req, res) => {
  const { date_from, date_to } = req.query;
  const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const to = date_to || new Date().toISOString().split('T')[0];

  try {
    const query = `
      WITH activity_client AS (
        SELECT 
          client_id, 
          SUM(duration_seconds) / 60.0 as minutes
        FROM tracked_activities
        WHERE user_id = $1 AND DATE(start_time) BETWEEN $2 AND $3
        GROUP BY client_id
      ),
      manual_client AS (
        SELECT 
          client_id, 
          SUM(duration_minutes) as minutes
        FROM manual_entries
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
        GROUP BY client_id
      ),
      combined AS (
        SELECT COALESCE(a.client_id, m.client_id) as client_id,
               COALESCE(a.minutes, 0) as tracked_minutes,
               COALESCE(m.minutes, 0) as manual_minutes
        FROM activity_client a
        FULL OUTER JOIN manual_client m ON a.client_id = m.client_id
      )
      SELECT 
        c.id as client_id,
        COALESCE(c.name, 'Untagged') as client_name,
        ROUND(COALESCE(comb.tracked_minutes, 0)) as tracked_minutes,
        ROUND(COALESCE(comb.manual_minutes, 0)) as manual_minutes,
        ROUND(COALESCE(comb.tracked_minutes, 0) + COALESCE(comb.manual_minutes, 0)) as total_minutes,
        ROUND(((COALESCE(comb.tracked_minutes, 0) + COALESCE(comb.manual_minutes, 0)) / 60.0) * COALESCE(c.default_hourly_rate, 0)) as amount_npr
      FROM combined comb
      LEFT JOIN clients c ON comb.client_id = c.id
      ORDER BY total_minutes DESC;
    `;
    
    const result = await pool.query(query, [req.user.id, from, to]);
    
    const by_client = result.rows
      .filter(r => r.client_id !== null)
      .map(r => ({
        client_id: r.client_id,
        client_name: r.client_name,
        tracked_minutes: parseFloat(r.tracked_minutes),
        manual_minutes: parseFloat(r.manual_minutes),
        total_minutes: parseFloat(r.total_minutes),
        amount_npr: parseFloat(r.amount_npr)
      }));

    const untaggedRow = result.rows.find(r => r.client_id === null);
    const untagged_minutes = untaggedRow ? parseFloat(untaggedRow.total_minutes) : 0;

    const total_amount_npr = by_client.reduce((sum, r) => sum + r.amount_npr, 0);

    res.json({
      by_client,
      untagged_minutes,
      total_amount_npr
    });
  } catch (err) {
    console.error('Client analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/analytics/revenue:
 *   get:
 *     tags: [Analytics]
 *     summary: Revenue analytics
 *     description: Returns revenue trend over time based on manual entries.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         description: "Lookback period. Example values: 7d, 30d, 90d."
 *         schema:
 *           type: string
 *           example: "30d"
 *     responses:
 *       200:
 *         description: Revenue trend payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trend:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date: { type: string, format: date }
 *                       hours: { type: number, example: 2.5 }
 *                       amount_npr: { type: integer, example: 15000 }
 *                 total_npr: { type: integer, example: 150000 }
 *                 total_hours: { type: number, example: 25.5 }
 *                 avg_daily_npr: { type: integer, example: 5000 }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/revenue', auth, async (req, res) => {
  const { period = '30d' } = req.query;
  const days = parseInt(period.replace('d', ''));
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const from = fromDate.toISOString().split('T')[0];

  try {
    const trendQuery = `
      SELECT 
        date::text,
        SUM(duration_minutes / 60.0) as hours,
        SUM((duration_minutes / 60.0) * COALESCE(c.default_hourly_rate, 0)) as amount_npr
      FROM manual_entries m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.user_id = $1 AND m.date >= $2
      GROUP BY date
      ORDER BY date
    `;
    const result = await pool.query(trendQuery, [req.user.id, from]);
    
    const trend = result.rows.map(r => ({
      date: r.date,
      amount_npr: Math.round(parseFloat(r.amount_npr)),
      hours: parseFloat(parseFloat(r.hours).toFixed(1))
    }));

    const total_npr = trend.reduce((sum, r) => sum + r.amount_npr, 0);
    const total_hours = trend.reduce((sum, r) => sum + r.hours, 0);

    res.json({
      trend,
      total_npr,
      total_hours: parseFloat(total_hours.toFixed(1)),
      avg_daily_npr: Math.round(total_npr / days)
    });
  } catch (err) {
    console.error('Revenue analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/analytics/categories:
 *   get:
 *     tags: [Analytics]
 *     summary: Category analytics
 *     description: Returns breakdown of billable suggestion minutes by category for a date range.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         description: Start date (YYYY-MM-DD). Defaults to first day of current month.
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         description: End date (YYYY-MM-DD). Defaults to today.
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Categories payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category: { type: string, example: "legal_research" }
 *                       label: { type: string, example: "Legal Research" }
 *                       minutes: { type: integer, example: 120 }
 *                       percentage: { type: integer, example: 60 }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/categories', auth, async (req, res) => {
  const { date_from, date_to } = req.query;
  const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const to = date_to || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `SELECT category, SUM(duration_minutes) as minutes
       FROM billable_suggestions
       WHERE user_id = $1 AND date BETWEEN $2 AND $3
       GROUP BY category`,
      [req.user.id, from, to]
    );

    const totalMinutes = result.rows.reduce((sum, r) => sum + parseInt(r.minutes), 0);
    
    // Helper to format labels
    const formatLabel = (key) => key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const categories = result.rows.map(r => ({
      category: r.category,
      label: formatLabel(r.category),
      minutes: parseInt(r.minutes),
      percentage: totalMinutes > 0 ? Math.round((parseInt(r.minutes) / totalMinutes) * 100) : 0
    }));

    res.json({ categories });
  } catch (err) {
    console.error('Category analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/analytics/weekly:
 *   get:
 *     tags: [Analytics]
 *     summary: Weekly analytics
 *     description: Returns last N weeks of aggregated tracked activity minutes and estimated amounts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: weeks
 *         description: Number of weeks to include.
 *         schema:
 *           type: integer
 *           example: 4
 *     responses:
 *       200:
 *         description: Weekly payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 weeks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       week_label: { type: string, example: "Mar 09 - Mar 15" }
 *                       billable_minutes: { type: integer, example: 300 }
 *                       untagged_minutes: { type: integer, example: 60 }
 *                       amount_npr: { type: integer, example: 25000 }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/weekly', auth, async (req, res) => {
  const { weeks = 4 } = req.query;
  
  try {
    const query = `
      SELECT 
        TO_CHAR(DATE_TRUNC('week', start_time), 'Mon DD') || ' - ' || TO_CHAR(DATE_TRUNC('week', start_time) + INTERVAL '6 days', 'Mon DD') as week_label,
        SUM(CASE WHEN client_id IS NOT NULL THEN duration_seconds ELSE 0 END) / 60.0 as billable_minutes,
        SUM(CASE WHEN client_id IS NULL THEN duration_seconds ELSE 0 END) / 60.0 as untagged_minutes,
        SUM(CASE WHEN client_id IS NOT NULL THEN (duration_seconds / 3600.0) * COALESCE(c.default_hourly_rate, 0) ELSE 0 END) as amount_npr
      FROM tracked_activities a
      LEFT JOIN clients c ON a.client_id = c.id
      WHERE a.user_id = $1 AND start_time >= NOW() - INTERVAL '$2 weeks'
      GROUP BY DATE_TRUNC('week', start_time)
      ORDER BY DATE_TRUNC('week', start_time)
    `.replace('$2', parseInt(weeks)); // Use replace for INTERVAL since $ placeholder doesn't work inside INTERVAL directly in some pg configs

    const result = await pool.query(query, [req.user.id]);
    
    res.json({
      weeks: result.rows.map(r => ({
        week_label: r.week_label,
        billable_minutes: Math.round(parseFloat(r.billable_minutes)),
        untagged_minutes: Math.round(parseFloat(r.untagged_minutes)),
        amount_npr: Math.round(parseFloat(r.amount_npr))
      }))
    });
  } catch (err) {
    console.error('Weekly analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/analytics/bills-status:
 *   get:
 *     tags: [Analytics]
 *     summary: Bills status breakdown
 *     description: Returns bill counts and totals grouped by status.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statuses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status: { type: string, enum: [draft, sent, paid] }
 *                       count: { type: integer, example: 3 }
 *                       total_npr: { type: number, example: 150000 }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/bills-status', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) as count, SUM(total_npr) as total_npr
       FROM bills
       WHERE user_id = $1
       GROUP BY status`,
      [req.user.id]
    );

    res.json({
      statuses: result.rows.map(r => ({
        status: r.status,
        count: parseInt(r.count),
        total_npr: parseFloat(r.total_npr)
      }))
    });
  } catch (err) {
    console.error('Bills status analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
