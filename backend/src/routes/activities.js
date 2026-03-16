const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { matchRules } = require('../utils/matchRules');
const { convertActivityToEntry } = require('../utils/entryConverter');

/**
 * @swagger
 * /api/activities:
 *   post:
 *     tags: [Activities]
 *     summary: Ingest a single tracked activity
 *     description: Ingest a single tracked activity event from a tracker client (browser/desktop).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source_type, start_time, end_time, duration_seconds]
 *             properties:
 *               source_type:
 *                 type: string
 *                 enum: [browser, desktop]
 *               app_name:
 *                 type: string
 *                 nullable: true
 *               window_title:
 *                 type: string
 *                 nullable: true
 *               domain:
 *                 type: string
 *                 nullable: true
 *               file_name:
 *                 type: string
 *                 nullable: true
 *               url:
 *                 type: string
 *                 nullable: true
 *               start_time:
 *                 type: string
 *                 format: date-time
 *               end_time:
 *                 type: string
 *                 format: date-time
 *               duration_seconds:
 *                 type: integer
 *                 minimum: 0
 *                 description: Duration in seconds (some clients may send ms; server normalizes).
 *               client_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               matter:
 *                 type: string
 *                 nullable: true
 *           examples:
 *             browser:
 *               value:
 *                 source_type: browser
 *                 app_name: "Chrome"
 *                 window_title: "Westlaw - Search Results"
 *                 domain: "westlaw.com"
 *                 url: "https://westlaw.com/..."
 *                 start_time: "2026-03-16T10:00:00.000Z"
 *                 end_time: "2026-03-16T10:05:00.000Z"
 *                 duration_seconds: 300
 *     responses:
 *       201:
 *         description: Activity ingested
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrackedActivity'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
    // Normalize duration to seconds (some clients may send milliseconds).
    const startMs = Date.parse(start_time);
    const endMs = Date.parse(end_time);
    const deltaSeconds = Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, Math.round((endMs - startMs) / 1000))
      : null;
    const providedSeconds = Number(duration_seconds);
    const normalizedDurationSeconds =
      typeof deltaSeconds === 'number' && deltaSeconds > 0 && Number.isFinite(providedSeconds)
        ? (Math.abs(providedSeconds - deltaSeconds) <= 5
            ? providedSeconds
            : (Math.abs(providedSeconds / 1000 - deltaSeconds) <= 5
                ? Math.round(providedSeconds / 1000)
                : providedSeconds))
        : providedSeconds;

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
       start_time, end_time, normalizedDurationSeconds, final_client_id, final_matter]
    );

    if (final_client_id) {
      await convertActivityToEntry(pool, result.rows[0]);
    }

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
 *     tags: [Activities]
 *     summary: Ingest multiple activities at once
 *     description: Ingest multiple tracked activity events in a single request.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activities]
 *             properties:
 *               activities:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [source_type, start_time, end_time, duration_seconds]
 *                   properties:
 *                     source_type: { type: string, enum: [browser, desktop] }
 *                     app_name: { type: string, nullable: true }
 *                     window_title: { type: string, nullable: true }
 *                     domain: { type: string, nullable: true }
 *                     file_name: { type: string, nullable: true }
 *                     url: { type: string, nullable: true }
 *                     start_time: { type: string, format: date-time }
 *                     end_time: { type: string, format: date-time }
 *                     duration_seconds: { type: integer, minimum: 0 }
 *                     client_id: { type: string, format: uuid, nullable: true }
 *                     matter: { type: string, nullable: true }
 *           examples:
 *             batch:
 *               value:
 *                 activities:
 *                   - source_type: desktop
 *                     app_name: "Microsoft Word"
 *                     window_title: "Motion_Draft_v2.docx"
 *                     file_name: "Motion_Draft_v2.docx"
 *                     start_time: "2026-03-16T10:00:00.000Z"
 *                     end_time: "2026-03-16T10:15:00.000Z"
 *                     duration_seconds: 900
 *     responses:
 *       201:
 *         description: Activities ingested
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inserted: { type: integer, example: 1 }
 *                 activities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TrackedActivity'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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

      // Normalize duration to seconds (some clients may send milliseconds).
      const aStartMs = Date.parse(a.start_time);
      const aEndMs = Date.parse(a.end_time);
      const aDeltaSeconds = Number.isFinite(aStartMs) && Number.isFinite(aEndMs)
        ? Math.max(0, Math.round((aEndMs - aStartMs) / 1000))
        : null;
      const aProvidedSeconds = Number(a.duration_seconds);
      const aNormalizedDurationSeconds =
        typeof aDeltaSeconds === 'number' && aDeltaSeconds > 0 && Number.isFinite(aProvidedSeconds)
          ? (Math.abs(aProvidedSeconds - aDeltaSeconds) <= 5
              ? aProvidedSeconds
              : (Math.abs(aProvidedSeconds / 1000 - aDeltaSeconds) <= 5
                  ? Math.round(aProvidedSeconds / 1000)
                  : aProvidedSeconds))
          : aProvidedSeconds;

      const r = await client.query(
        `INSERT INTO tracked_activities
          (user_id, source_type, app_name, window_title, domain, file_name, url, start_time, end_time, duration_seconds, client_id, matter)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [req.user.id, a.source_type, a.app_name, a.window_title, a.domain,
         a.file_name, a.url, a.start_time, a.end_time, aNormalizedDurationSeconds, final_client_id, final_matter]
      );

      if (final_client_id) {
        await convertActivityToEntry(client, r.rows[0]);
      }

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
/**
 * @swagger
 * /api/activities/untagged:
 *   get:
 *     tags: [Activities]
 *     summary: Count untagged activities
 *     description: Returns the count of untagged (client_id is null) tracked activities in the past 7 days.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer, example: 12 }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
/**
 * @swagger
 * /api/activities/{id}/assign:
 *   patch:
 *     tags: [Activities]
 *     summary: Assign activity to client/matter
 *     description: Assigns a tracked activity to a client (and optional matter). Also auto-converts to a manual entry.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Activity UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id]
 *             properties:
 *               client_id: { type: string, format: uuid }
 *               matter: { type: string, nullable: true }
 *           examples:
 *             assign:
 *               value:
 *                 client_id: "9b6b62e2-1d7a-4a3a-b8c3-2e8b1c4f0f11"
 *                 matter: "Contract Review"
 *     responses:
 *       200:
 *         description: Updated activity
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrackedActivity'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Activity not found
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
router.patch('/:id/assign', auth, async (req, res) => {
  const { client_id, matter } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });
  try {
    const { rows } = await pool.query(
      'UPDATE tracked_activities SET client_id = $1, matter = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [client_id, matter || null, req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Activity not found' });
    
    // Auto-convert to time entry now that it's tagged
    await convertActivityToEntry(pool, rows[0]);

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
 *     tags: [Activities]
 *     summary: List tracked activities
 *     description: Returns tracked activities for the authenticated user with optional filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: source_type
 *         description: Filter by source type
 *         schema:
 *           type: string
 *           enum: [browser, desktop]
 *       - in: query
 *         name: date
 *         description: Filter by activity start date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated activities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activities:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/TrackedActivity'
 *                       - type: object
 *                         properties:
 *                           client_name: { type: string, nullable: true }
 *                 total: { type: integer, example: 123 }
 *                 limit: { type: integer, example: 50 }
 *                 offset: { type: integer, example: 0 }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *     tags: [Activities]
 *     summary: Activity stats for a date
 *     description: Returns aggregated activity stats grouped by source type, plus top apps for a specific date.
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
 *         description: Stats result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date: { type: string, format: date }
 *                 by_source:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       source_type: { type: string, enum: [browser, desktop] }
 *                       event_count: { type: string, example: "42" }
 *                       total_seconds: { type: string, example: "3600" }
 *                       total_hours: { type: string, example: "1.00" }
 *                 top_apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       app_name: { type: string }
 *                       total_seconds: { type: string, example: "1800" }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
