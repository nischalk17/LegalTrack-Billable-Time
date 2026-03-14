const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');

// POST /api/bills/generate - Generate a bill
router.post('/generate', auth, async (req, res) => {
  const { client_id, date_from, date_to, matter, include_tracked_activities } = req.body;

  if (!client_id || !date_from || !date_to) {
    return res.status(400).json({ error: 'client_id, date_from, and date_to are required' });
  }

  const dbClient = await pool.connect();
  try {
    const clientRes = await dbClient.query('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [client_id, req.user.id]);
    if (clientRes.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    const client = clientRes.rows[0];

    // Fetch manual_entries
    let conditions = ['user_id = $1', 'client_id = $2', 'date >= $3', 'date <= $4'];
    let params = [req.user.id, client_id, date_from, date_to];
    let idx = 5;
    if (matter) {
      conditions.push(`matter ILIKE $${idx++}`);
      params.push(`%${matter}%`);
    }
    const { rows: manualEntries } = await dbClient.query(
      `SELECT * FROM manual_entries WHERE ${conditions.join(' AND ')} ORDER BY date ASC`, params
    );

    if (manualEntries.length === 0) {
      return res.status(400).json({ error: 'No entries found for this period' });
    }

    let subtotal_npr = 0;
    const lineItems = [];

    for (const entry of manualEntries) {
      const amount = Math.round((entry.duration_minutes / 60) * client.default_hourly_rate);
      subtotal_npr += amount;
      lineItems.push({
        source: entry.activity_id ? 'tracked' : 'manual', 
        entry_id: entry.id, 
        description: entry.description,
        date: entry.date, 
        duration_minutes: entry.duration_minutes,
        hourly_rate_npr: client.default_hourly_rate, 
        amount_npr: amount
      });
    }

    lineItems.sort((a, b) => new Date(a.date) - new Date(b.date));

    const vat_amount_npr = client.is_vat_applicable ? Math.round(subtotal_npr * 0.13) : 0;
    const total_npr = subtotal_npr + vat_amount_npr;

    await dbClient.query('BEGIN');

    const sequenceRes = await dbClient.query(`SELECT COUNT(*) + 1 as seq FROM bills WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`, [req.user.id]);
    const sequence = sequenceRes.rows[0].seq.toString().padStart(3, '0');
    const currentYear = new Date().getFullYear();
    const bill_number = `INV-${currentYear}-${sequence}`;

    const billInsert = await dbClient.query(
      `INSERT INTO bills (user_id, client_id, bill_number, matter, date_from, date_to, subtotal_npr, vat_amount_npr, total_npr, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING *`,
      [req.user.id, client_id, bill_number, matter || null, date_from, date_to, subtotal_npr, vat_amount_npr, total_npr]
    );
    const bill = billInsert.rows[0];

    for (const li of lineItems) {
      await dbClient.query(
        `INSERT INTO bill_line_items (bill_id, entry_id, description, date, duration_minutes, hourly_rate_npr, amount_npr, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [bill.id, li.entry_id, li.description, li.date, li.duration_minutes, li.hourly_rate_npr, li.amount_npr, li.source]
      );
    }

    await dbClient.query('COMMIT');
    res.status(201).json({ ...bill, line_items: lineItems });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Generate bill err:', err);
    res.status(500).json({ error: 'Server error generating bill' });
  } finally {
    dbClient.release();
  }
});

// GET /api/bills - List all bills
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, c.name as client_name 
       FROM bills b JOIN clients c ON b.client_id = c.id 
       WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bills/:id - Get single bill with line items
router.get('/:id', auth, async (req, res) => {
  try {
    const billRes = await pool.query(
      `SELECT b.*, c.name as client_name, c.address, c.pan_number, c.email
       FROM bills b JOIN clients c ON b.client_id = c.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (billRes.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });
    const bill = billRes.rows[0];
    const linesRes = await pool.query('SELECT * FROM bill_line_items WHERE bill_id = $1 ORDER BY date ASC', [bill.id]);
    res.json({ ...bill, line_items: linesRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/bills/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  if (!['draft', 'sent', 'paid'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const { rows } = await pool.query(
      'UPDATE bills SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Bill not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/bills/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM bills WHERE id = $1 AND user_id = $2 AND status = $3 RETURNING id',
      [req.params.id, req.user.id, 'draft']
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Bill not found or not draft' });
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const formatNPR = (amount) => 'Rs. ' + amount.toLocaleString('en-IN');
const formatDuration = (mins) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

// GET /api/bills/:id/pdf
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const billRes = await pool.query(
      `SELECT b.*, c.name as client_name, c.address, c.pan_number
       FROM bills b JOIN clients c ON b.client_id = c.id WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (billRes.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });
    const bill = billRes.rows[0];

    const linesRes = await pool.query('SELECT * FROM bill_line_items WHERE bill_id = $1 ORDER BY date ASC', [bill.id]);
    const lineItems = linesRes.rows;

    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const firmName = userRes.rows[0]?.name || 'Law Firm';

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${bill.bill_number}.pdf"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(24).text(firmName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).text('TAX INVOICE', { align: 'center', characterSpacing: 2 });
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(10).text('Bill Number:', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(` ${bill.bill_number}`);
    
    const invoiceDate = bill.created_at ? new Date(bill.created_at).toISOString().split('T')[0] : '';
    doc.font('Helvetica-Bold').text('Date:', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(` ${invoiceDate}`);

    const dateFrom = bill.date_from ? new Date(bill.date_from).toISOString().split('T')[0] : '';
    const dateTo = bill.date_to ? new Date(bill.date_to).toISOString().split('T')[0] : '';
    doc.font('Helvetica-Bold').text('Period:', 50, doc.y, { continued: true });
    doc.font('Helvetica').text(` ${dateFrom} to ${dateTo}`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').text('Billed To:');
    doc.font('Helvetica').text(bill.client_name);
    if (bill.address) doc.text(bill.address);
    if (bill.pan_number) doc.text(`PAN: ${bill.pan_number}`);
    doc.moveDown(2);

    const startY = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Date', 50, startY, { width: 60 });
    doc.text('Description', 110, startY, { width: 200 });
    doc.text('Hours', 310, startY, { width: 50, align: 'right' });
    doc.text('Rate', 370, startY, { width: 70, align: 'right' });
    doc.text('Amount', 450, startY, { width: 95, align: 'right' });
    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).lineWidth(1).stroke();
    doc.y += 15;

    doc.font('Helvetica');
    lineItems.forEach(item => {
      if (doc.y > 700) { doc.addPage(); doc.y = 50; }
      const y = doc.y;
      const itemDate = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
      doc.text(itemDate, 50, y, { width: 60 });
      doc.text(item.description || '', 110, y, { width: 200 });
      doc.text(formatDuration(item.duration_minutes), 310, y, { width: 50, align: 'right' });
      doc.text(formatNPR(item.hourly_rate_npr), 370, y, { width: 70, align: 'right' });
      doc.text(formatNPR(item.amount_npr), 450, y, { width: 95, align: 'right' });
      doc.y = Math.max(doc.y, y + 15);
    });

    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).lineWidth(1).stroke();
    doc.y += 15;

    doc.text('Subtotal:', 310, doc.y, { width: 130, align: 'right' });
    doc.text(formatNPR(bill.subtotal_npr), 450, doc.y - 12, { width: 95, align: 'right' });
    doc.moveDown(0.5);

    if (bill.vat_amount_npr > 0) {
      doc.text('VAT (13%):', 310, doc.y, { width: 130, align: 'right' });
      doc.text(formatNPR(bill.vat_amount_npr), 450, doc.y - 12, { width: 95, align: 'right' });
      doc.moveDown(0.5);
    }

    doc.moveTo(310, doc.y).lineTo(545, doc.y).lineWidth(1).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Total Due:', 310, doc.y, { width: 130, align: 'right' });
    doc.text(formatNPR(bill.total_npr), 450, doc.y - 14, { width: 95, align: 'right' });

    doc.font('Helvetica-Oblique').fontSize(10);
    const bottomY = doc.page.height - 100;
    if (doc.y < bottomY) doc.y = bottomY; else doc.moveDown(2);
    doc.text('Payment due within 30 days', { align: 'center' });
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
