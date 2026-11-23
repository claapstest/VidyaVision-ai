import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const config = {
  server: process.env.MSSQL_HOST || 'localhost',
  port: parseInt(process.env.MSSQL_PORT || '1433', 10),
  user: process.env.MSSQL_USER || 'sa',
  password: process.env.MSSQL_PASSWORD || '',
  database: process.env.MSSQL_DATABASE || 'vidyavision',
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false',
    enableArithAbort: true
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    pool.on('error', (err) => {
      console.error('[MSSQL POOL ERROR]', err.message);
      pool = null;
    });
  }
  return pool;
}

/**
 * Universal Query Helper — accepts parameterised SQL with @p0, @p1, ... placeholders.
 * Converts the PG-style $1, $2, ... placeholders to @p0, @p1, ... automatically
 * so the rest of the codebase can migrate incrementally.
 */
export async function query(text, params) {
  const start = Date.now();
  const p = await getPool();
  const request = p.request();

  // Convert PostgreSQL $1, $2, ... to @p0, @p1, ... and bind parameters
  let converted = text;
  if (params && params.length > 0) {
    for (let i = 0; i < params.length; i++) {
      const pgPlaceholder = `$${i + 1}`;
      const mssqlPlaceholder = `@p${i}`;
      converted = converted.split(pgPlaceholder).join(mssqlPlaceholder);

      let value = params[i];
      // Convert JS objects/arrays to JSON string for NVARCHAR(MAX) columns
      if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) {
        value = JSON.stringify(value);
      }
      // Convert boolean to bit
      if (typeof value === 'boolean') {
        value = value ? 1 : 0;
      }
      request.input(`p${i}`, value);
    }
  }

  const res = await request.query(converted);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log('[SQL]', { text: converted, duration: `${duration}ms`, rows: res.rowsAffected?.[0] });
  }

  // Return a PG-compatible shape so callers don't need rewriting
  return {
    rows: res.recordset || [],
    rowCount: res.recordset ? res.recordset.length : (res.rowsAffected?.[0] || 0)
  };
}

/**
 * Connection Health Check
 */
export async function isDbConnected() {
  try {
    const p = await getPool();
    const res = await p.request().query('SELECT 1 AS status');
    return res.recordset.length > 0;
  } catch (err) {
    console.error('SQL Server Connection Check Failed:', err.message);
    return false;
  }
}

export { sql, getPool };
export default { query, isDbConnected, sql, getPool };
