const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { matchRules } = require('../utils/matchRules');

// GET /api/rules
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, c.name as client_name 
       FROM tracking_rules r
       JOIN clients c ON r.client_id = c.id
       WHERE r.user_id = $1
       ORDER BY priority DESC, created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('List rules error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/rules
router.post('/', auth, async (req, res) => {
  const { client_id, matter, rule_type, pattern, match_type, priority } = req.body;
  if (!client_id || !rule_type || !pattern || !match_type) {
    return res.status(400).json({ error: 'client_id, rule_type, pattern, and match_type are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO tracking_rules (user_id, client_id, matter, rule_type, pattern, match_type, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, client_id, matter || null, rule_type, pattern, match_type, priority || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/rules/:id
router.put('/:id', auth, async (req, res) => {
  const { client_id, matter, rule_type, pattern, match_type, priority } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tracking_rules SET
        client_id = COALESCE($1, client_id),
        matter = COALESCE($2, matter),
        rule_type = COALESCE($3, rule_type),
        pattern = COALESCE($4, pattern),
        match_type = COALESCE($5, match_type),
        priority = COALESCE($6, priority)
       WHERE id = $7 AND user_id = $8 RETURNING *`,
      [client_id, matter, rule_type, pattern, match_type, priority, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/rules/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tracking_rules WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/rules/test
router.post('/test', auth, async (req, res) => {
  const activity = req.body;
  try {
    const rulesRes = await pool.query(
      `SELECT r.*, c.name as client_name 
       FROM tracking_rules r
       JOIN clients c ON r.client_id = c.id
       WHERE r.user_id = $1
       ORDER BY priority DESC, created_at DESC`,
      [req.user.id]
    );
    const rules = rulesRes.rows;
    const match = matchRules(activity, rules);
    
    if (match) {
      res.json({ match: true, rule: match, client_name: match.client_name, matter: match.matter });
    } else {
      res.json({ match: false, rule: null });
    }
  } catch (error) {
    console.error('Test rule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
