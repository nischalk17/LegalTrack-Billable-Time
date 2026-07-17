const cron = require('node-cron');
const pool = require('../db/pool');
const { generateBillForClient } = require('../routes/bills');
const { sendDraftBillReadyEmail } = require('../utils/mailer');

const EARLIEST_ENTRY_DATE = '2000-01-01';

/**
 * For every (user, client) pair with unbilled manual_entries, generates a
 * draft bill covering all of that client's unbilled time and emails the
 * lawyer that it's ready to review. Runs monthly; also exported so it can
 * be triggered manually/from tests.
 */
async function runAutoBilling() {
  const today = new Date().toISOString().split('T')[0];

  const { rows: pairs } = await pool.query(`
    SELECT DISTINCT me.user_id, me.client_id, u.email, u.name
    FROM manual_entries me
    JOIN users u ON u.id = me.user_id
    WHERE me.billed_at IS NULL AND me.client_id IS NOT NULL
  `);

  console.log(`[auto-billing] found ${pairs.length} client(s) with unbilled time`);

  for (const pair of pairs) {
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      const result = await generateBillForClient(
        dbClient, pair.user_id, pair.client_id, EARLIEST_ENTRY_DATE, today, null
      );

      if (result.error) {
        await dbClient.query('ROLLBACK');
        continue;
      }

      await dbClient.query('COMMIT');

      const billUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/clients/${pair.client_id}`;
      await sendDraftBillReadyEmail({
        to: pair.email,
        clientName: result.client.name,
        billNumber: result.bill.bill_number,
        totalNpr: result.bill.total_npr,
        billUrl,
      });
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
