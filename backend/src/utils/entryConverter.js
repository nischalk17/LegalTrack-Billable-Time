/**
 * Utility to convert tagged tracked activities into manual time entries.
 */
async function convertActivityToEntry(dbClient, activity) {
  const {
    id, user_id, client_id, matter, 
    window_title, app_name, domain, 
    start_time, duration_seconds, source_type
  } = activity;

  if (!client_id) return null;

  // Convert seconds to minutes (round up to minimum 1 minute)
  const duration_minutes = Math.max(1, Math.round(duration_seconds / 60));
  
  // Date from start_time
  const date = new Date(start_time).toISOString().split('T')[0];

  // Construct description
  let description = window_title || app_name || (domain ? `Browsing ${domain}` : 'Tracked Activity');
  
  try {
    // Get client name for the 'client' column in manual_entries (legacy field)
    const clientRes = await dbClient.query('SELECT name FROM clients WHERE id = $1', [client_id]);
    const clientName = clientRes.rows[0]?.name || 'Unknown Client';

    // Insert into manual_entries
    const result = await dbClient.query(
      `INSERT INTO manual_entries 
        (user_id, client_id, client, matter, description, date, duration_minutes, source_type, activity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (activity_id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         client = EXCLUDED.client,
         matter = EXCLUDED.matter,
         description = EXCLUDED.description,
         date = EXCLUDED.date,
         duration_minutes = EXCLUDED.duration_minutes,
         updated_at = NOW()
       RETURNING *`,
      [user_id, client_id, clientName, matter, description, date, duration_minutes, source_type, id]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error converting activity to entry:', error);
    throw error;
  }
}

module.exports = { convertActivityToEntry };
