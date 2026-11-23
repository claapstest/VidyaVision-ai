import sql from 'mssql';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function setupDatabase() {
  console.log('--- Setting up SQL Server Database ---');

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
    }
  };

  const pool = await sql.connect(config);
  console.log(`Connected to SQL Server: ${config.server}/${config.database}`);

  try {
    // Table 1: users (Authentication & RBAC)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
      CREATE TABLE users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'counselor',
        permissions NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_users_email' AND object_id = OBJECT_ID('users'))
      CREATE INDEX idx_users_email ON users(email);
    `);
    console.log("✔ Table 'users' verified");

    // Seed default super admin
    const adminHash = bcrypt.hashSync('VidyaVision@2026', 10);
    const adminPermissions = JSON.stringify({
      canStartStopCampaigns: true,
      canUploadLeads: true,
      canManageColleges: true,
      canExportData: true,
      canViewReports: true,
      canViewTranscripts: true,
      canAddNotes: true
    });

    const existingAdmin = await pool.request()
      .input('email', 'admin@vidyavision.com')
      .query("SELECT id FROM users WHERE email = @email");

    if (existingAdmin.recordset.length === 0) {
      await pool.request()
        .input('id', 'admin_super_01')
        .input('email', 'admin@vidyavision.com')
        .input('password_hash', adminHash)
        .input('name', 'System Admin')
        .input('role', 'admin')
        .input('permissions', adminPermissions)
        .input('status', 'active')
        .query(`
          INSERT INTO users (id, email, password_hash, name, role, permissions, status)
          VALUES (@id, @email, @password_hash, @name, @role, @permissions, @status);
        `);
    }
    console.log("✔ Super Admin 'admin@vidyavision.com' seeded");

    // Table 2: colleges (Universities, Bots, Courses)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='colleges' AND xtype='U')
      CREATE TABLE colleges (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        place VARCHAR(255) DEFAULT 'India',
        agent_id INT,
        languages VARCHAR(255) DEFAULT 'English, Hindi',
        courses NVARCHAR(MAX) DEFAULT '[]',
        status VARCHAR(32) DEFAULT 'active',
        website_url VARCHAR(512),
        description NVARCHAR(MAX),
        counselor_phone VARCHAR(50) DEFAULT '+91 98765 43210',
        created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_colleges_agent_id' AND object_id = OBJECT_ID('colleges'))
      CREATE INDEX idx_colleges_agent_id ON colleges(agent_id);
    `);
    console.log("✔ Table 'colleges' verified");

    // Table 3: campaigns (Sequential Dialing Campaigns)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='campaigns' AND xtype='U')
      CREATE TABLE campaigns (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        university_id VARCHAR(64),
        university_name VARCHAR(255),
        college_place VARCHAR(255),
        course VARCHAR(255),
        agent_id INT,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        total_count INT DEFAULT 0,
        completed_count INT DEFAULT 0,
        answered_count INT DEFAULT 0,
        unanswered_count INT DEFAULT 0,
        dispatch_error_count INT DEFAULT 0,
        delay_seconds INT DEFAULT 2,
        end_mode VARCHAR(32) DEFAULT 'none',
        max_duration_minutes INT,
        transfer_enabled BIT DEFAULT 0,
        counselor_phone VARCHAR(50) DEFAULT '+91 98765 43210',
        transfer_condition NVARCHAR(MAX),
        transfer_message NVARCHAR(MAX),
        scheduled_start_time DATETIMEOFFSET,
        started_at DATETIMEOFFSET,
        completed_at DATETIMEOFFSET,
        canceled_at DATETIMEOFFSET,
        paused_at DATETIMEOFFSET,
        stopped_reason NVARCHAR(MAX),
        created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_campaigns_status' AND object_id = OBJECT_ID('campaigns'))
      CREATE INDEX idx_campaigns_status ON campaigns(status);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_campaigns_created' AND object_id = OBJECT_ID('campaigns'))
      CREATE INDEX idx_campaigns_created ON campaigns(created_at DESC);
    `);
    console.log("✔ Table 'campaigns' verified");

    // Table 4: campaign_contacts (Sequential Dialing Contacts)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='campaign_contacts' AND xtype='U')
      CREATE TABLE campaign_contacts (
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
        call_duration VARCHAR(32) DEFAULT N'—',
        retry_count INT DEFAULT 0,
        reason NVARCHAR(MAX),
        extra_fields NVARCHAR(MAX) DEFAULT '{}',
        [timestamp] DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_camp_contacts_camp' AND object_id = OBJECT_ID('campaign_contacts'))
      CREATE INDEX idx_camp_contacts_camp ON campaign_contacts(campaign_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_camp_contacts_phone' AND object_id = OBJECT_ID('campaign_contacts'))
      CREATE INDEX idx_camp_contacts_phone ON campaign_contacts(phone);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_camp_contacts_status' AND object_id = OBJECT_ID('campaign_contacts'))
      CREATE INDEX idx_camp_contacts_status ON campaign_contacts(status);
    `);
    console.log("✔ Table 'campaign_contacts' verified");

    // Table 5: call_records (Master Call Logs)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='call_records' AND xtype='U')
      CREATE TABLE call_records (
        id VARCHAR(128) PRIMARY KEY,
        contact_number VARCHAR(32) NOT NULL,
        clean_phone VARCHAR(16) NOT NULL,
        student_name VARCHAR(255),
        call_date VARCHAR(64),
        call_duration VARCHAR(32),
        duration_seconds INT DEFAULT 0,
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
        recording_url NVARCHAR(MAX),
        summary NVARCHAR(MAX),
        transcript NVARCHAR(MAX),
        raw_fields NVARCHAR(MAX) DEFAULT '{}',
        extracted_variables NVARCHAR(MAX) DEFAULT '{}',
        source VARCHAR(32) DEFAULT 'google_sheets',
        created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_call_records_unique' AND object_id = OBJECT_ID('call_records'))
      CREATE UNIQUE INDEX idx_call_records_unique ON call_records(clean_phone, call_date);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_call_records_clean_phone' AND object_id = OBJECT_ID('call_records'))
      CREATE INDEX idx_call_records_clean_phone ON call_records(clean_phone);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_call_records_created' AND object_id = OBJECT_ID('call_records'))
      CREATE INDEX idx_call_records_created ON call_records(created_at DESC);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_call_records_lead_status' AND object_id = OBJECT_ID('call_records'))
      CREATE INDEX idx_call_records_lead_status ON call_records(lead_status);
    `);
    console.log("✔ Table 'call_records' verified");

    // Table 6: webhook_events (Audit Log)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='webhook_events' AND xtype='U')
      CREATE TABLE webhook_events (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        payload NVARCHAR(MAX) NOT NULL,
        status VARCHAR(32) DEFAULT 'processed',
        error_message NVARCHAR(MAX),
        created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
      );
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_webhook_events_status' AND object_id = OBJECT_ID('webhook_events'))
      CREATE INDEX idx_webhook_events_status ON webhook_events(status);
    `);
    console.log("✔ Table 'webhook_events' verified");

    console.log('\n=============================================');
    console.log('SQL SERVER SCHEMA INITIALIZED SUCCESSFULLY!');
    console.log('=============================================');
  } finally {
    await pool.close();
  }
}

setupDatabase().catch(err => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
