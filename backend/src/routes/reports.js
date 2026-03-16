const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');

/**
 * @swagger
 * /api/reports/pdf:
 *   get:
 *     tags: [Reports]
 *     summary: Download a PDF time report
 *     description: |
 *       Generates a PDF time report from manual entries.
 *
 *       The response is a binary PDF (`application/pdf`) suitable for download.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         description: Include entries on/after this date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         description: Include entries on/before this date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: client
 *         description: Filter by client name (partial match). Accepts a string.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF generated
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error generating PDF
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/pdf', auth, async (req, res) => {
  try {
    const { date_from, date_to, client } = req.query;

    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userResult.rows[0]?.name || 'User';

    let conditions = ['m.user_id = $1'];
    let params = [req.user.id];
    let idx = 2;

    if (date_from) {
      conditions.push(`m.date >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`m.date <= $${idx++}`);
      params.push(date_to);
    }
    if (client) {
      // client parameter might be name or id depending on frontend string
      // matching by client_id or generic client name string
      conditions.push(`(m.client ILIKE $${idx} OR c.name ILIKE $${idx})`);
      params.push(`%${client}%`);
      idx++;
    }

    const { rows } = await pool.query(
      `SELECT m.*, c.name as relation_client_name 
       FROM manual_entries m
       LEFT JOIN clients c ON m.client_id = c.id
       WHERE ${conditions.join(' AND ')} 
       ORDER BY c.name ASC NULLS LAST, m.client ASC NULLS LAST, m.matter ASC NULLS LAST, m.date ASC`,
      params
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    const filename = `TimeReport_${date_from || 'All'}_${date_to || 'All'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const formatDuration = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    };

    doc.font('Helvetica-Bold').fontSize(20).text(`Time Report — ${userName}`, { align: 'center' });
    doc.moveDown(0.5);

    let dateRangeStr = 'All Dates';
    if (date_from && date_to) dateRangeStr = `${date_from} to ${date_to}`;
    else if (date_from) dateRangeStr = `Since ${date_from}`;
    else if (date_to) dateRangeStr = `Until ${date_to}`;

    doc.font('Helvetica').fontSize(10).fillColor('#666666');
    doc.text(`Date Range: ${dateRangeStr}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
    doc.moveDown(2);

    doc.fillColor('#000000');
    
    const grouped = {};
    rows.forEach(r => {
      const c = r.relation_client_name || r.client || 'Unknown Client';
      const m = r.matter || 'General Matter';
      if (!grouped[c]) grouped[c] = {};
      if (!grouped[c][m]) grouped[c][m] = [];
      grouped[c][m].push(r);
    });

    let grandTotalMins = 0;

    if (Object.keys(grouped).length === 0) {
      doc.font('Helvetica-Oblique').fontSize(12).text('No entries found for this period.', { align: 'center' });
    } else {
      for (const [cName, matters] of Object.entries(grouped)) {
        doc.font('Helvetica-Bold').fontSize(14).text(cName);
        doc.moveDown(0.5);

        for (const [mName, entries] of Object.entries(matters)) {
          doc.font('Helvetica-Oblique').fontSize(12).text(mName, { indent: 10 });
          doc.moveDown(0.5);

          const startY = doc.y;
          doc.font('Helvetica-Bold').fontSize(10);
          doc.text('Date', 60, startY, { width: 70 });
          doc.text('Description', 130, startY, { width: 230 });
          doc.text('Duration', 370, startY, { width: 70, align: 'right' });
          doc.text('Rate', 450, startY, { width: 45, align: 'right' });

          doc.moveTo(60, doc.y + 5).lineTo(495, doc.y + 5).lineWidth(1).stroke();
          doc.y += 15;

          let matterTotalMins = 0;
          doc.font('Helvetica').fontSize(10);

          entries.forEach(entry => {
            if (doc.y > 750) {
              doc.addPage();
              doc.y = 50;
            }
            const y = doc.y;
            const entryDate = entry.date ? new Date(entry.date).toISOString().split('T')[0] : '';
            
            doc.text(entryDate, 60, y, { width: 70 });
            doc.text(entry.description || '', 130, y, { width: 230 });
            doc.text(formatDuration(entry.duration_minutes), 370, y, { width: 70, align: 'right' });
            doc.text('', 450, y, { width: 45, align: 'right' });
            
            matterTotalMins += entry.duration_minutes;
            doc.y = Math.max(doc.y, y + 15);
          });

          grandTotalMins += matterTotalMins;

          doc.moveDown(0.5);
          doc.font('Helvetica-Bold');
          doc.text(`Subtotal (${mName}):`, 130, doc.y, { width: 230, align: 'right' });
          const subY = doc.y - 12;
          doc.text(formatDuration(matterTotalMins), 370, subY, { width: 70, align: 'right' });
          doc.moveDown(1.5);
        }
      }

      doc.moveDown(1);
      doc.moveTo(60, doc.y).lineTo(495, doc.y).lineWidth(2).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('GRAND TOTAL:', 130, doc.y, { width: 230, align: 'right' });
      doc.text(formatDuration(grandTotalMins), 370, doc.y - 14, { width: 70, align: 'right' });
    }

    doc.end();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error generating PDF' });
    }
  }
});

module.exports = router;
