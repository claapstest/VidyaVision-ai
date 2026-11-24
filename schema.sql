-- ==============================================================================
-- VidyaVision AI - SQL Server Database Initialization Script
-- Compatible with: Microsoft SQL Server 2016 (SP2+), 2017, 2019, 2022
-- Compatible with: SQL Server Management Studio (SSMS) 18, 19, 20
-- ==============================================================================

-- 1. Create Database if it does not exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'vidyavision')
BEGIN
    PRINT 'Creating database [vidyavision]...';
    CREATE DATABASE [vidyavision];
END
ELSE
BEGIN
    PRINT 'Database [vidyavision] already exists.';
END
GO

USE [vidyavision];
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ==============================================================================
-- Table 1: users (Authentication, Roles, and Granular RBAC Permissions)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'users' AND xtype = 'U')
BEGIN
    PRINT 'Creating table [users]...';
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
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_email' AND object_id = OBJECT_ID('users'))
BEGIN
    CREATE INDEX idx_users_email ON users(email);
END
GO

-- Seed Default Super Admin Account if not present
-- Email: admin@vidyavision.com | Password: VidyaVision@2026
IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@vidyavision.com')
BEGIN
    PRINT 'Seeding default Super Admin account (admin@vidyavision.com)...';
    INSERT INTO users (id, email, password_hash, name, role, permissions, status)
    VALUES (
        'admin_super_01',
        'admin@vidyavision.com',
        '$2b$10$kCtDPck45cYV48lNQfS/C.K60XhLXtWE9kV3UTY.r1Qbw2IxqAp/e',
        'System Admin',
        'admin',
        N'{"canStartStopCampaigns":true,"canUploadLeads":true,"canManageColleges":true,"canExportData":true,"canViewReports":true,"canViewTranscripts":true,"canAddNotes":true}',
        'active'
    );
END
GO

-- ==============================================================================
-- Table 2: colleges (Colleges, Universities, AI Voice Agent IDs, and Courses)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'colleges' AND xtype = 'U')
BEGIN
    PRINT 'Creating table [colleges]...';
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
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_colleges_agent_id' AND object_id = OBJECT_ID('colleges'))
BEGIN
    CREATE INDEX idx_colleges_agent_id ON colleges(agent_id);
END
GO

-- ==============================================================================
-- Table 3: campaigns (Outbound Calling Campaigns and Scheduling)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'campaigns' AND xtype = 'U')
BEGIN
    PRINT 'Creating table [campaigns]...';
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
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_campaigns_status' AND object_id = OBJECT_ID('campaigns'))
BEGIN
    CREATE INDEX idx_campaigns_status ON campaigns(status);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_campaigns_created' AND object_id = OBJECT_ID('campaigns'))
BEGIN
    CREATE INDEX idx_campaigns_created ON campaigns(created_at DESC);
END
GO

-- ==============================================================================
-- Table 4: campaign_contacts (Student Leads and Queue for Each Campaign)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'campaign_contacts' AND xtype = 'U')
BEGIN
    PRINT 'Creating table [campaign_contacts]...';
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
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_camp_contacts_camp' AND object_id = OBJECT_ID('campaign_contacts'))
BEGIN
    CREATE INDEX idx_camp_contacts_camp ON campaign_contacts(campaign_id);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_camp_contacts_phone' AND object_id = OBJECT_ID('campaign_contacts'))
BEGIN
    CREATE INDEX idx_camp_contacts_phone ON campaign_contacts(phone);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_camp_contacts_status' AND object_id = OBJECT_ID('campaign_contacts'))
BEGIN
    CREATE INDEX idx_camp_contacts_status ON campaign_contacts(status);
END
GO

-- ==============================================================================
-- Table 5: call_records (Master Call Logs, Transcripts, and Analytics)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'call_records' AND xtype = 'U')
BEGIN
    PRINT 'Creating table [call_records]...';
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
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_call_records_unique' AND object_id = OBJECT_ID('call_records'))
BEGIN
    CREATE UNIQUE INDEX idx_call_records_unique ON call_records(clean_phone, call_date);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_call_records_clean_phone' AND object_id = OBJECT_ID('call_records'))
BEGIN
    CREATE INDEX idx_call_records_clean_phone ON call_records(clean_phone);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_call_records_created' AND object_id = OBJECT_ID('call_records'))
BEGIN
    CREATE INDEX idx_call_records_created ON call_records(created_at DESC);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_call_records_lead_status' AND object_id = OBJECT_ID('call_records'))
BEGIN
    CREATE INDEX idx_call_records_lead_status ON call_records(lead_status);
END
GO

-- ==============================================================================
-- Table 6: webhook_events (Incoming Webhook Audit Trail)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'webhook_events' AND xtype = 'U')
BEGIN
    PRINT 'Creating table [webhook_events]...';
    CREATE TABLE webhook_events (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        payload NVARCHAR(MAX) NOT NULL,
        status VARCHAR(32) DEFAULT 'processed',
        error_message NVARCHAR(MAX),
        created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_webhook_events_status' AND object_id = OBJECT_ID('webhook_events'))
BEGIN
    CREATE INDEX idx_webhook_events_status ON webhook_events(status);
END
GO

-- ==============================================================================
-- Optional: Dedicated Application Database User & Role Configuration
-- (DBA can uncomment and run this section to create a dedicated app login)
-- ==============================================================================
/*
USE [master];
GO
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'vidyavision_app')
BEGIN
    CREATE LOGIN [vidyavision_app] WITH PASSWORD = 'ChangeThisStrongPassword!2026', CHECK_POLICY = ON;
END
GO

USE [vidyavision];
GO
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'vidyavision_app')
BEGIN
    CREATE USER [vidyavision_app] FOR LOGIN [vidyavision_app];
    ALTER ROLE [db_owner] ADD MEMBER [vidyavision_app];
END
GO
*/

PRINT '=======================================================';
PRINT 'VidyaVision AI Database Schema setup completed successfully!';
PRINT '=======================================================';
GO
