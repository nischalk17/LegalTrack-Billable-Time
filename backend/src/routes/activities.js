const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// POST /api/activities - Ingest tracked activity (from extension or desktop tracker)
router.post('/', auth, [
  body('source_type').isIn(['browser', 'desktop']),
  body('start_time').isISO8601(),
  body('end_time').isISO8601(),
  body('duration_seconds').isInt({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    source_type, app_name, window_title, domain,
    file_name, url, start_time, end_time, duration_seconds
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO tracked_activities
        (user_id, source_type, app_name, window_title, domain, file_name, url, start_time, end_time, duration_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.id, source_type, app_name, window_title, domain, file_name, url,
       start_time, end_time, duration_seconds]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ingest activity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/activities/batch - Ingest multiple activities at once
router.post('/batch', auth, async (req, res) => {
  const { activities } = req.body;
  if (!Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'activities must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const a of activities) {
      const r = await client.query(
        `INSERT INTO tracked_activities
          (user_id, source_type, app_name, window_title, domain, file_name, url, start_time, end_time, duration_seconds)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [req.user.id, a.source_type, a.app_name, a.window_title, a.domain,
         a.file_name, a.url, a.start_time, a.end_time, a.duration_seconds]
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ inserted: inserted.length, activities: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Batch ingest error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/activities - List activities with filters
router.get('/', auth, [
  query('source_type').optional().isIn(['browser', 'desktop']),
  query('date').optional().isDate(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
], async (req, res) => {
  const { source_type, date, limit = 50, offset = 0 } = req.query;

  let conditions = ['user_id = $1'];
  let params = [req.user.id];
  let idx = 2;

  if (source_type) {
    conditions.push(`source_type = $${idx++}`);
    params.push(source_type);
  }
  if (date) {
    conditions.push(`DATE(start_time) = $${idx++}`);
    params.push(date);
  }

  params.push(parseInt(limit));
  params.push(parseInt(offset));

  try {
    const result = await pool.query(
      `SELECT * FROM tracked_activities
       WHERE ${conditions.join(' AND ')}
       ORDER BY start_time DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM tracked_activities WHERE ${conditions.slice(0, -0).join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({
      activities: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List activities error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/activities/stats - Daily summary stats
router.get('/stats', auth, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `SELECT
        source_type,
        COUNT(*) as event_count,
        SUM(duration_seconds) as total_seconds,
        ROUND(SUM(duration_seconds) / 3600.0, 2) as total_hours
       FROM tracked_activities
       WHERE user_id = $1 AND DATE(start_time) = $2
       GROUP BY source_type`,
      [req.user.id, targetDate]
    );

    const topApps = await pool.query(
      `SELECT app_name, SUM(duration_seconds) as total_seconds
       FROM tracked_activities
       WHERE user_id = $1 AND DATE(start_time) = $2 AND app_name IS NOT NULL
       GROUP BY app_name
       ORDER BY total_seconds DESC
       LIMIT 5`,
      [req.user.id, targetDate]
    );

    res.json({
      date: targetDate,
      by_source: result.rows,
      top_apps: topApps.rows
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
