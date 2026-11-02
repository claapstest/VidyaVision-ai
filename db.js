import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

// Construct connection URL:
// 1. If DATABASE_URL is set (Render / Cloud / custom), use it directly.
// 2. Otherwise fallback to local PostgreSQL defaults on port 5433.
const localHost = process.env.PG_HOST || 'localhost';
const localPort = process.env.PG_PORT || '5433';
const localUser = process.env.PG_USER || 'postgres';
const localPassword = process.env.PG_PASSWORD || 'postgres';
const localDb = process.env.PG_DATABASE || 'vidyavision';

const connectionString = process.env.DATABASE_URL ||
  `postgresql://${localUser}:${localPassword}@${localHost}:${localPort}/${localDb}`;

const isProduction = process.env.NODE_ENV === 'production' || connectionString.includes('render.com');

export const pool = new Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 20, // Max concurrent client connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[POSTGRES POOL ERROR]', err.message);
});

/**
 * Universal Query Helper
 * @param {string} text SQL statement
 * @param {Array} params Bind parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log('[SQL]', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
}

/**
 * Connection Health Check
 */
export async function isDbConnected() {
  try {
    const res = await pool.query('SELECT 1 AS status');
    return res.rowCount > 0;
  } catch (err) {
    console.error('PostgreSQL Connection Check Failed:', err.message);
    return false;
  }
}

export default { pool, query, isDbConnected };

