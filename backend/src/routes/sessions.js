const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// POST /api/sessions/start
router.post('/start', auth, async (req, res) => {
  const { client_id, matter } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // End any currently active session
    await client.query(
      `UPDATE active_sessions SET ended_at = NOW(), is_active = false 
       WHERE user_id = $1 AND is_active = true`,
      [req.user.id]
    );

    // Start new session
    const result = await client.query(
      `INSERT INTO active_sessions (user_id, client_id, matter) 
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, client_id, matter || null]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/sessions/end
router.post('/end', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE active_sessions SET ended_at = NOW(), is_active = false 
       WHERE user_id = $1 AND is_active = true RETURNING *`,
      [req.user.id]
    );
    res.json(result.rows[0] || { message: 'No active session found' });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sessions/active
router.get('/active', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, c.name as client_name 
       FROM active_sessions s
       JOIN clients c ON s.client_id = c.id
       WHERE s.user_id = $1 AND s.is_active = true 
       LIMIT 1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
