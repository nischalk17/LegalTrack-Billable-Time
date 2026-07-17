const cron = require('node-cron');
const pool = require('../db/pool');
const { generateBillForClient } = require('../routes/bills');
const { sendDraftBillReadyEmail } = require('../utils/mailer');

const EARLIEST_ENTRY_DATE = '2000-01-01';

/**
 * For every (organization, client) pair with unbilled manual_entries
 * (shared across everyone in the org), generates a draft bill covering all
 * of that client's unbilled time and emails every owner/admin in the
 * organization that it's ready to review. Runs monthly; also exported so it
 * can be triggered manually/from tests.
 */
async function runAutoBilling() {
  const today = new Date().toISOString().split('T')[0];

  const { rows: pairs } = await pool.query(`
    SELECT DISTINCT organization_id, client_id
    FROM manual_entries
    WHERE billed_at IS NULL AND client_id IS NOT NULL AND organization_id IS NOT NULL
  `);

  console.log(`[auto-billing] found ${pairs.length} client(s) with unbilled time`);

  for (const pair of pairs) {
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Attribute the auto-generated bill to one of the org's owners.
      const ownerRes = await dbClient.query(
        `SELECT user_id FROM organization_members WHERE organization_id = $1 AND role = 'owner' ORDER BY created_at ASC LIMIT 1`,
        [pair.organization_id]
      );
      const createdByUserId = ownerRes.rows[0]?.user_id || null;

      const result = await generateBillForClient(
        dbClient, pair.organization_id, createdByUserId, pair.client_id, EARLIEST_ENTRY_DATE, today, null
      );

      if (result.error) {
        await dbClient.query('ROLLBACK');
        continue;
      }

      await dbClient.query('COMMIT');

      const recipientsRes = await pool.query(
        `SELECT u.email FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.organization_id = $1 AND om.role IN ('owner', 'admin')`,
        [pair.organization_id]
      );

      const billUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/clients/${pair.client_id}`;
      for (const recipient of recipientsRes.rows) {
        await sendDraftBillReadyEmail({
          to: recipient.email,
          clientName: result.client.name,
          billNumber: result.bill.bill_number,
          totalNpr: result.bill.total_npr,
          billUrl,
        });
      }
    } catch (err) {
      await dbClient.query('ROLLBACK');
      console.error('[auto-billing] error for client', pair.client_id, err);
    } finally {
      dbClient.release();
    }
  }
}

function scheduleAutoBilling() {
  // 06:00 on the 1st of every month
  cron.schedule('0 6 1 * *', () => {
    runAutoBilling().catch(err => console.error('[auto-billing] run failed:', err));
  });
  console.log('📅 Auto-billing scheduled: 1st of each month at 06:00');
}

module.exports = { scheduleAutoBilling, runAutoBilling };
