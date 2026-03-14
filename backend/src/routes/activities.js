const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { matchRules } = require('../utils/matchRules');

/**
 * @swagger
 * /api/activities:
 *   post:
 *     summary: Ingest a single tracked activity
 */
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
    file_name, url, start_time, end_time, duration_seconds,
    client_id: req_client_id, matter: req_matter
  } = req.body;

  try {
    let final_client_id = req_client_id || null;
    let final_matter = req_matter || null;

    if (!final_client_id) {
      const sessionRes = await pool.query(
        `SELECT * FROM active_sessions 
         WHERE user_id = $1 AND started_at <= $2 
         AND (ended_at >= $2 OR is_active = true) 
         ORDER BY started_at DESC LIMIT 1`,
        [req.user.id, start_time]
      );
      if (sessionRes.rows.length > 0) {
        final_client_id = sessionRes.rows[0].client_id;
        final_matter = sessionRes.rows[0].matter;
      } else {
        const rulesRes = await pool.query(
          `SELECT * FROM tracking_rules WHERE user_id = $1 ORDER BY priority DESC`,
          [req.user.id]
        );
        const match = matchRules(req.body, rulesRes.rows);
        if (match) {
          final_client_id = match.client_id;
          final_matter = match.matter;
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO tracked_activities
        (user_id, source_type, app_name, window_title, domain, file_name, url, start_time, end_time, duration_seconds, client_id, matter)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.user.id, source_type, app_name, window_title, domain, file_name, url,
       start_time, end_time, duration_seconds, final_client_id, final_matter]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ingest activity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities/batch:
 *   post:
 *     summary: Ingest multiple activities at once
 */
router.post('/batch', auth, async (req, res) => {
  const { activities } = req.body;
  if (!Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'activities must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];

    const rulesRes = await client.query(
      `SELECT * FROM tracking_rules WHERE user_id = $1 ORDER BY priority DESC`,
      [req.user.id]
    );
    const rules = rulesRes.rows;

    for (const a of activities) {
      let final_client_id = a.client_id || null;
      let final_matter = a.matter || null;

      if (!final_client_id) {
        const sessionRes = await client.query(
          `SELECT * FROM active_sessions 
           WHERE user_id = $1 AND started_at <= $2 
           AND (ended_at >= $2 OR is_active = true) 
           ORDER BY started_at DESC LIMIT 1`,
          [req.user.id, a.start_time]
        );
        if (sessionRes.rows.length > 0) {
          final_client_id = sessionRes.rows[0].client_id;
          final_matter = sessionRes.rows[0].matter;
        } else {
          const match = matchRules(a, rules);
          if (match) {
            final_client_id = match.client_id;
            final_matter = match.matter;
          }
        }
      }

      const r = await client.query(
        `INSERT INTO tracked_activities
          (user_id, source_type, app_name, window_title, domain, file_name, url, start_time, end_time, duration_seconds, client_id, matter)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [req.user.id, a.source_type, a.app_name, a.window_title, a.domain,
         a.file_name, a.url, a.start_time, a.end_time, a.duration_seconds, final_client_id, final_matter]
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

// GET /api/activities/untagged -> Return count of untagged activities past 7 days
router.get('/untagged', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM tracked_activities 
       WHERE user_id = $1 AND client_id IS NULL AND start_time >= NOW() - INTERVAL '7 days'`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error('Untagged count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/activities/:id/assign
router.patch('/:id/assign', auth, async (req, res) => {
  const { client_id, matter } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  try {
    const { rows } = await pool.query(
      'UPDATE tracked_activities SET client_id = $1, matter = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [client_id, matter || null, req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Activity not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Assign activity error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities:
 *   get:
 */
router.get('/', auth, [
  query('source_type').optional().isIn(['browser', 'desktop']),
  query('date').optional().isDate(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
], async (req, res) => {
  const { source_type, date, limit = 50, offset = 0 } = req.query;

  let conditions = ['a.user_id = $1'];
  let params = [req.user.id];
  let idx = 2;

  if (source_type) {
    conditions.push(`a.source_type = $${idx++}`);
    params.push(source_type);
  }
  if (date) {
    conditions.push(`DATE(a.start_time) = $${idx++}`);
    params.push(date);
  }

  const limitIdx = idx++;
  params.push(parseInt(limit));
  
  const offsetIdx = idx++;
  params.push(parseInt(offset));

  try {
    const result = await pool.query(
      `SELECT a.*, c.name as client_name FROM tracked_activities a
       LEFT JOIN clients c ON a.client_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.start_time DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM tracked_activities a WHERE ${conditions.join(' AND ')}`,
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

/**
 * @swagger
 * /api/activities/stats:
 *   get:
 */
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
