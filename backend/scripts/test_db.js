import net from 'net';
import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const host = process.env.MSSQL_HOST || 'localhost';
const port = parseInt(process.env.MSSQL_PORT || '1433', 10);
const user = process.env.MSSQL_USER || 'sa';
const password = process.env.MSSQL_PASSWORD || '';
const database = process.env.MSSQL_DATABASE || 'vidyavision';
const encrypt = process.env.MSSQL_ENCRYPT === 'true';
const trustCert = process.env.MSSQL_TRUST_CERT !== 'false';

console.log('====================================================');
console.log('       VidyaVision SQL Server Diagnostic Test       ');
console.log('====================================================');
console.log(`Target Host:       ${host}`);
console.log(`Port:              ${port}`);
console.log(`Target Database:   ${database}`);
console.log(`SQL User:          ${user}`);
console.log(`Password Configured: ${password ? 'Yes (***)' : 'No (empty)'}`);
console.log(`Encrypt:           ${encrypt}`);
console.log(`Trust Server Cert: ${trustCert}`);
console.log('----------------------------------------------------');

function testTcpSocket(h, p, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isResolved = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      isResolved = true;
      socket.destroy();
      reject(new Error(`TCP connection timed out after ${timeoutMs}ms. Is port ${p} open and reachable?`));
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error(err.message || err.code || 'Connection refused'));
      }
    });

    socket.connect(p, h);
  });
}

async function runDiagnostic() {
  // Step 1: Network / Port Reachability Check
  console.log(`[1/3] Testing TCP connectivity to ${host}:${port}...`);
  try {
    await testTcpSocket(host, port, 4000);
    console.log(`✔ TCP Socket connected successfully to ${host}:${port}`);
  } catch (err) {
    console.error(`✖ TCP Connection Failed: ${err.message}`);
    console.log('\n--- Diagnostic Advice ---');
    if (host === 'localhost' || host === '127.0.0.1') {
      console.log('1. Microsoft SQL Server is not currently running on this local machine.');
      console.log('2. If you are testing with the client\'s SQL Server, update MSSQL_HOST in your .env with the client\'s server IP.');
      console.log('3. Ensure SQL Server service (MSSQLSERVER) is started and TCP/IP protocol is enabled in SQL Server Configuration Manager.');
    } else {
      console.log(`1. Cannot reach ${host} on port ${port}.`);
      console.log('2. Check if the Windows Firewall on the database server allows inbound traffic on port 1433.');
      console.log('3. Verify that TCP/IP is enabled under SQL Server Configuration Manager on the target machine.');
    }
    process.exit(1);
  }

  // Step 2: Authentication & Database Connection
  console.log(`\n[2/3] Authenticating as '${user}' on database '${database}'...`);
  const config = {
    server: host,
    port: port,
    user: user,
    password: password,
    database: database,
    options: {
      encrypt: encrypt,
      trustServerCertificate: trustCert,
      enableArithAbort: true
    },
    connectionTimeout: 8000
  };

  let pool = null;
  try {
    pool = await sql.connect(config);
    console.log(`✔ Successfully authenticated and connected to SQL Server!`);
  } catch (err) {
    console.error(`✖ SQL Connection Error: ${err.message}`);
    console.log('\n--- Diagnostic Advice ---');
    if (err.message.includes('Login failed')) {
      console.log('1. Check MSSQL_USER and MSSQL_PASSWORD in .env.');
      console.log('2. Verify that SQL Server is configured for "SQL Server and Windows Authentication mode (Mixed Mode)".');
      console.log('3. Ensure the SQL user account is active and has access to the database.');
    } else if (err.message.includes('Cannot open database')) {
      console.log(`1. Database '${database}' does not exist on the server.`);
      console.log(`2. Run 'CREATE DATABASE ${database};' in SSMS or execute schema.sql.`);
    } else if (err.message.includes('certificate')) {
      console.log('1. TLS certificate validation error. Ensure MSSQL_TRUST_CERT=true in .env.');
    }
    process.exit(1);
  }

  // Step 3: Run queries to check server info and tables
  console.log(`\n[3/3] Inspecting SQL Server details and existing tables...`);
  try {
    const verRes = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS current_db');
    const verLine = verRes.recordset[0].version.split('\n')[0];
    console.log(`✔ Server Version:   ${verLine}`);
    console.log(`✔ Current Database: ${verRes.recordset[0].current_db}`);

    const tablesRes = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    const existingTables = tablesRes.recordset.map(r => r.TABLE_NAME);
    console.log(`✔ Tables found (${existingTables.length}):`, existingTables.join(', ') || 'No tables yet');

    const requiredTables = ['users', 'colleges', 'campaigns', 'campaign_contacts', 'call_records', 'webhook_events'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length === 0) {
      console.log('\n====================================================');
      console.log('  STATUS: ALL 6 TABLES ARE PRESENT AND READY!       ');
      console.log('====================================================');
    } else {
      console.log(`\n⚠ Missing tables: ${missingTables.join(', ')}`);
      console.log('Run `npm run db:init` to automatically generate the missing tables.');
    }
  } catch (err) {
    console.error(`Query check error: ${err.message}`);
  } finally {
    if (pool) await pool.close();
  }
}

runDiagnostic();
