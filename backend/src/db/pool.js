const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in the environment.');
  process.exit(1);
}

// Log connection info (masking credentials)
const dbUrl = new URL(process.env.DATABASE_URL);
console.log(`📡 Attempting to connect to database: "${dbUrl.pathname.split('/')[1]}" on ${dbUrl.hostname}:${dbUrl.port || 5432}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  // Serverless Postgres (Neon, etc.) scales its compute to zero when idle
  // and takes a few seconds to wake on the next connection — 2s was too
  // aggressive and made the very first connection after any idle period
  // fail with a timeout.
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected at:', res.rows[0].now);
  }
});

module.exports = pool;
