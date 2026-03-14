const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// ============================================================
// Suggestion generation rules
// Maps activity data → category + description
// ============================================================
function classifyActivity(activity) {
  const title = (activity.window_title || '').toLowerCase();
  const domain = (activity.domain || '').toLowerCase();
  const app = (activity.app_name || '').toLowerCase();
  const file = (activity.file_name || '').toLowerCase();

  // Browser-based legal research
  if (domain.includes('westlaw') || domain.includes('lexisnexis') ||
      domain.includes('lexis') || domain.includes('casetext') ||
      domain.includes('fastcase') || domain.includes('courtlistener')) {
    return { category: 'legal_research', description: `Legal Research on ${activity.domain}` };
  }

  // Court filings / PACER
  if (domain.includes('pacer') || domain.includes('ecf.') || title.includes('pacer')) {
    return { category: 'court_filing', description: 'Court Filing / PACER Access' };
  }

  // General legal research
  if (title.includes('legal research') || title.includes('case law') || title.includes('statute')) {
    return { category: 'legal_research', description: 'Legal Research' };
  }

  // PDF / Document review
  if (file.endsWith('.pdf') || title.includes('.pdf') || app.includes('acrobat') ||
      app.includes('pdf') || title.includes('reviewing') || title.includes('review')) {
    const docName = activity.file_name || 'Document';
    return { category: 'document_review', description: `Document Review: ${docName}` };
  }

  // Drafting in Word
  if ((app.includes('word') || app.includes('winword')) && (
      title.includes('motion') || title.includes('brief') || title.includes('complaint') ||
      title.includes('contract') || title.includes('agreement') || title.includes('draft')
  )) {
    return { category: 'drafting', description: `Drafting: ${activity.window_title}` };
  }

  // General Word document work
  if (app.includes('word') || app.includes('winword') || file.endsWith('.docx') || file.endsWith('.doc')) {
    return { category: 'drafting', description: `Document Drafting: ${activity.window_title || activity.file_name}` };
  }

  // Email (Outlook)
  if (app.includes('outlook') || domain.includes('outlook') || domain.includes('mail.google')) {
    return { category: 'client_communication', description: 'Client Email Communication' };
  }

  // Video calls
  if (app.includes('teams') || app.includes('zoom') || app.includes('webex') ||
      title.includes('meeting') || title.includes('call')) {
    return { category: 'client_meeting', description: 'Client Meeting / Call' };
  }

  // Excel / Spreadsheets
  if (app.includes('excel') || file.endsWith('.xlsx') || file.endsWith('.csv')) {
    return { category: 'analysis', description: `Document Analysis: ${activity.window_title || 'Spreadsheet'}` };
  }

  // Browser general
  if (activity.source_type === 'browser') {
    return { category: 'research', description: `Online Research: ${activity.domain || activity.window_title}` };
  }

  // Desktop fallback
  return { category: 'general_work', description: `Work in ${activity.app_name || 'Application'}: ${activity.window_title || ''}`.trim() };
}

/**
 * @swagger
 * /api/suggestions/generate:
 *   post:
 *     summary: Generate billable suggestions from recent activities
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Date to generate suggestions for (defaults to today)
 *     responses:
 *       200:
 *         description: Suggestions generated successfully
 *       500:
 *         description: Server error
 */
// POST /api/suggestions/generate - Generate suggestions from recent unprocessed activities
router.post('/generate', auth, async (req, res) => {
  const { date } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    // Get activities for the date that don't have suggestions yet
    const activities = await pool.query(
      `SELECT ta.* FROM tracked_activities ta
       LEFT JOIN billable_suggestions bs ON bs.activity_id = ta.id
       WHERE ta.user_id = $1
         AND DATE(ta.start_time) = $2
         AND bs.id IS NULL
         AND ta.duration_seconds >= 60`,  // Skip activities under 1 minute
      [req.user.id, targetDate]
    );

    if (activities.rows.length === 0) {
      return res.json({ message: 'No new activities to process', generated: 0 });
    }

    const client = await pool.connect();
    const suggestions = [];

    try {
      await client.query('BEGIN');

      for (const activity of activities.rows) {
        const { category, description } = classifyActivity(activity);
        const duration_minutes = Math.max(1, Math.round(activity.duration_seconds / 60));

        const result = await client.query(
          `INSERT INTO billable_suggestions
            (user_id, activity_id, description, category, app_name, domain, duration_minutes, date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [req.user.id, activity.id, description, category,
           activity.app_name, activity.domain, duration_minutes, targetDate]
        );
        suggestions.push(result.rows[0]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ generated: suggestions.length, suggestions });
  } catch (err) {
    console.error('Generate suggestions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/suggestions:
 *   get:
 *     summary: List generated suggestions
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *       - in: query
 *         name: date
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
 *         description: List of suggestions
 *       500:
 *         description: Server error
 */
// GET /api/suggestions - List suggestions
router.get('/', auth, async (req, res) => {
  const { status = 'pending', date, limit = 50, offset = 0 } = req.query;

  let conditions = ['user_id = $1'];
  let params = [req.user.id];
  let idx = 2;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }
  if (date) {
    conditions.push(`date = $${idx++}`);
    params.push(date);
  }

  params.push(parseInt(limit));
  params.push(parseInt(offset));

  try {
    const result = await pool.query(
      `SELECT * FROM billable_suggestions
       WHERE ${conditions.join(' AND ')}
       ORDER BY date DESC, created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    res.json({ suggestions: result.rows });
  } catch (err) {
    console.error('List suggestions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/suggestions/{id}/accept:
 *   patch:
 *     summary: Accept a suggestion and create a manual entry
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               client:
 *                 type: string
 *                 default: General
 *               matter:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Suggestion accepted and entry created
 *       404:
 *         description: Suggestion not found
 *       500:
 *         description: Server error
 */
// PATCH /api/suggestions/:id/accept - Accept suggestion → create manual entry
router.patch('/:id/accept', auth, async (req, res) => {
  const { client: clientName = 'General', matter, notes } = req.body;

  const dbClient = await pool.connect();
  try {
    const suggestion = await dbClient.query(
      'SELECT * FROM billable_suggestions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (suggestion.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    const s = suggestion.rows[0];
    await dbClient.query('BEGIN');

    // Create manual entry from suggestion
    const entry = await dbClient.query(
      `INSERT INTO manual_entries (user_id, client, matter, description, date, duration_minutes, source_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'suggestion',$7)
       RETURNING *`,
      [req.user.id, clientName, matter, s.description, s.date, s.duration_minutes, notes]
    );

    // Mark suggestion as accepted
    await dbClient.query(
      'UPDATE billable_suggestions SET status = $1 WHERE id = $2',
      ['accepted', s.id]
    );

    await dbClient.query('COMMIT');
    res.json({ suggestion: { ...s, status: 'accepted' }, entry: entry.rows[0] });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Accept suggestion error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    dbClient.release();
  }
});

/**
 * @swagger
 * /api/suggestions/{id}/dismiss:
 *   patch:
 *     summary: Dismiss a suggestion
 *     tags: [Suggestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Suggestion dismissed
 *       404:
 *         description: Suggestion not found
 *       500:
 *         description: Server error
 */
// PATCH /api/suggestions/:id/dismiss
router.patch('/:id/dismiss', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE billable_suggestions SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      ['dismissed', req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Suggestion not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
