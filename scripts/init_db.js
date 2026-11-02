import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Client, Pool } = pg;

async function setupDatabase() {
  console.log('--- Setting up PostgreSQL Database ---');

  // 1. Connect to root postgres db to ensure 'vidyavision' database exists
  const host = process.env.PG_HOST || 'localhost';
  const port = parseInt(process.env.PG_PORT || '5433', 10);
  const user = process.env.PG_USER || 'postgres';
  const password = process.env.PG_PASSWORD || 'postgres';

  const rootClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres'
  });

  try {
    await rootClient.connect();
    const checkDb = await rootClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'vidyavision'"
    );
    if (checkDb.rowCount === 0) {
      await rootClient.query('CREATE DATABASE vidyavision');
      console.log("✔ Created database 'vidyavision'");
    } else {
      console.log("✔ Database 'vidyavision' already exists");
    }
  } catch (err) {
    console.error('Error connecting to root postgres db:', err.message);
    throw err;
  } finally {
    await rootClient.end();
  }

  // 2. Connect to 'vidyavision' database and build schema
  const dbUrl = process.env.DATABASE_URL || `postgresql://${user}:${password}@${host}:${port}/vidyavision`;
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();
  try {
    console.log("Creating tables and indexes in 'vidyavision'...");

    // Table 1: users (Authentication & RBAC)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'counselor',
        permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log("✔ Table 'users' verified");

    // Seed default super admin
    const adminHash = bcrypt.hashSync('VidyaVision@2026', 10);
    const adminPermissions = {
      canStartStopCampaigns: true,
      canUploadLeads: true,
      canManageColleges: true,
      canExportData: true,
      canViewReports: true,
      canViewTranscripts: true,
      canAddNotes: true
    };
    await client.query(`
      INSERT INTO users (id, email, password_hash, name, role, permissions, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO NOTHING;
    `, [
      'admin_super_01',
      'admin@vidyavision.com',
      adminHash,
      'System Admin',
      'admin',
      JSON.stringify(adminPermissions),
      'active'
    ]);
    console.log("✔ Super Admin 'admin@vidyavision.com' seeded in PostgreSQL");

    // Table 2: colleges (Universities, Bots, Courses)
    await client.query(`
      CREATE TABLE IF NOT EXISTS colleges (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        place VARCHAR(255) DEFAULT 'India',
        agent_id INTEGER,
        languages VARCHAR(255) DEFAULT 'English, Hindi',
        courses TEXT[] DEFAULT '{}',
        status VARCHAR(32) DEFAULT 'active',
        website_url VARCHAR(512),
        description TEXT,
        counselor_phone VARCHAR(50) DEFAULT '+91 95730 97810',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_colleges_agent_id ON colleges(agent_id);
      ALTER TABLE colleges ADD COLUMN IF NOT EXISTS counselor_phone VARCHAR(50) DEFAULT '+91 95730 97810';
    `);
    console.log("✔ Table 'colleges' verified");

    // Table 3: campaigns (Sequential Dialing Campaigns)
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        university_id VARCHAR(64),
        university_name VARCHAR(255),
        college_place VARCHAR(255),
        course VARCHAR(255),
        agent_id INTEGER,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        total_count INTEGER DEFAULT 0,
        completed_count INTEGER DEFAULT 0,
        answered_count INTEGER DEFAULT 0,
        unanswered_count INTEGER DEFAULT 0,
        dispatch_error_count INTEGER DEFAULT 0,
        delay_seconds INTEGER DEFAULT 2,
        end_mode VARCHAR(32) DEFAULT 'none',
        max_duration_minutes INTEGER,
        transfer_enabled BOOLEAN DEFAULT FALSE,
        counselor_phone VARCHAR(50) DEFAULT '+91 95730 97810',
        transfer_condition TEXT,
        transfer_message TEXT,
        scheduled_start_time TIMESTAMP WITH TIME ZONE,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        canceled_at TIMESTAMP WITH TIME ZONE,
        paused_at TIMESTAMP WITH TIME ZONE,
        stopped_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS transfer_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS counselor_phone VARCHAR(50) DEFAULT '+91 95730 97810';
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS transfer_condition TEXT;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS transfer_message TEXT;
    `);
    console.log("✔ Table 'campaigns' verified");

    // Table 4: campaign_contacts (Sequential Dialing Contacts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_contacts (
        id VARCHAR(128) PRIMARY KEY,
        campaign_id VARCHAR(64) REFERENCES campaigns(id) ON DELETE CASCADE,
        phone VARCHAR(32) NOT NULL,
        formatted_phone VARCHAR(32) NOT NULL,
        name VARCHAR(255),
        university_id VARCHAR(64),
        university_name VARCHAR(255),
        course VARCHAR(255),
        program VARCHAR(255),
        email VARCHAR(255),
        state VARCHAR(128),
        district VARCHAR(128),
        status VARCHAR(32) DEFAULT 'queued',
        call_outcome VARCHAR(128) DEFAULT 'Pending',
        call_duration VARCHAR(32) DEFAULT '—',
        retry_count INTEGER DEFAULT 0,
        reason TEXT,
        extra_fields JSONB DEFAULT '{}'::jsonb,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_camp_contacts_camp ON campaign_contacts(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_camp_contacts_phone ON campaign_contacts(phone);
      CREATE INDEX IF NOT EXISTS idx_camp_contacts_status ON campaign_contacts(status);
    `);
    console.log("✔ Table 'campaign_contacts' verified");

    // Table 5: call_records (Master Call Logs & Google Sheets / Omni Ingestion)
    await client.query(`
      CREATE TABLE IF NOT EXISTS call_records (
        id VARCHAR(128) PRIMARY KEY,
        contact_number VARCHAR(32) NOT NULL,
        clean_phone VARCHAR(16) NOT NULL,
        student_name VARCHAR(255),
        call_date VARCHAR(64),
        call_duration VARCHAR(32),
        duration_seconds INTEGER DEFAULT 0,
        call_status VARCHAR(64),
        lead_status VARCHAR(128),
        student_interest VARCHAR(32),
        sentiment VARCHAR(64),
        counselor_followup VARCHAR(16) DEFAULT 'No',
        call_transferred VARCHAR(16) DEFAULT 'No',
        admission_timeline VARCHAR(128),
        entrance_exam VARCHAR(128),
        graduation_status VARCHAR(128),
        preferred_city VARCHAR(128),
        preferred_state VARCHAR(128),
        preferred_university VARCHAR(255),
        target_course VARCHAR(255),
        recording_url TEXT,
        summary TEXT,
        transcript TEXT,
        raw_fields JSONB DEFAULT '{}'::jsonb,
        extracted_variables JSONB DEFAULT '{}'::jsonb,
        source VARCHAR(32) DEFAULT 'google_sheets',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_call_records_unique ON call_records(clean_phone, call_date);
      CREATE INDEX IF NOT EXISTS idx_call_records_clean_phone ON call_records(clean_phone);
      CREATE INDEX IF NOT EXISTS idx_call_records_created ON call_records(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_call_records_lead_status ON call_records(lead_status);
    `);
    console.log("✔ Table 'call_records' verified");

    // Table 6: webhook_events (Audit Log & Resilient Buffer for Omni & Sheets)
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id BIGSERIAL PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(32) DEFAULT 'processed',
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
    `);
    console.log("✔ Table 'webhook_events' verified");

    console.log('\n=============================================');
    console.log('POSTGRESQL SCHEMA INITIALIZED SUCCESSFULLY!');
    console.log('=============================================');
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase().catch(err => {
  console.error('Database setup failed:', err);
  process.exit(1);
});

