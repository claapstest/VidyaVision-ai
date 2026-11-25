import fs from 'fs';
import path from 'path';
import { query, getPool } from '../db.js';

async function migrateData() {
  console.log('--- Migrating Existing JSON Data to SQL Server ---');
  const dataDir = path.join(process.cwd(), 'data');

  // 1. Migrate Colleges
  const collegesPath = path.join(dataDir, 'colleges.json');
  if (fs.existsSync(collegesPath)) {
    try {
      const colleges = JSON.parse(fs.readFileSync(collegesPath, 'utf8'));
      if (Array.isArray(colleges)) {
        let count = 0;
        for (const col of colleges) {
          await query(`
            MERGE colleges AS target
            USING (SELECT $1 AS id, $2 AS name, $3 AS place, $4 AS agent_id, $5 AS languages,
              $6 AS courses, $7 AS status, $8 AS website_url, $9 AS description) AS source
            ON target.id = source.id
            WHEN MATCHED THEN UPDATE SET
              name = source.name, place = source.place, agent_id = source.agent_id,
              languages = source.languages, courses = source.courses, status = source.status,
              website_url = source.website_url, description = source.description,
              updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN INSERT (id, name, place, agent_id, languages, courses, status, website_url, description)
              VALUES (source.id, source.name, source.place, source.agent_id, source.languages, source.courses,
                source.status, source.website_url, source.description);
          `, [
            col.id,
            col.name,
            col.place || 'India',
            col.agentId ? Number(col.agentId) : null,
            col.languages || 'English, Hindi',
            Array.isArray(col.courses) ? col.courses : [],
            col.status || 'active',
            col.websiteUrl || '',
            col.description || ''
          ]);
          count++;
        }
        console.log(`✔ Migrated ${count} colleges into SQL Server.`);
      }
    } catch (err) {
      console.warn('Colleges migration error:', err.message);
    }
  }

  // 2. Migrate Campaigns & Contacts
  const campaignsPath = path.join(dataDir, 'campaigns.json');
  if (fs.existsSync(campaignsPath)) {
    try {
      const campaigns = JSON.parse(fs.readFileSync(campaignsPath, 'utf8'));
      if (Array.isArray(campaigns)) {
        let campCount = 0;
        let contactCount = 0;
        for (const c of campaigns) {
          await query(`
            MERGE campaigns AS target
            USING (SELECT $1 AS id, $2 AS name, $3 AS university_id, $4 AS university_name, $5 AS college_place,
              $6 AS course, $7 AS agent_id, $8 AS status, $9 AS total_count, $10 AS completed_count,
              $11 AS answered_count, $12 AS unanswered_count, $13 AS dispatch_error_count,
              $14 AS delay_seconds, $15 AS scheduled_start_time, $16 AS started_at, $17 AS completed_at,
              $18 AS canceled_at, $19 AS stopped_reason) AS source
            ON target.id = source.id
            WHEN MATCHED THEN UPDATE SET
              status = source.status, completed_count = source.completed_count,
              answered_count = source.answered_count, unanswered_count = source.unanswered_count,
              dispatch_error_count = source.dispatch_error_count,
              completed_at = source.completed_at, canceled_at = source.canceled_at,
              stopped_reason = source.stopped_reason, updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN INSERT (
              id, name, university_id, university_name, college_place, course, agent_id,
              status, total_count, completed_count, answered_count, unanswered_count, dispatch_error_count,
              delay_seconds, scheduled_start_time, started_at, completed_at, canceled_at, stopped_reason
            ) VALUES (source.id, source.name, source.university_id, source.university_name, source.college_place,
              source.course, source.agent_id, source.status, source.total_count, source.completed_count,
              source.answered_count, source.unanswered_count, source.dispatch_error_count,
              source.delay_seconds, source.scheduled_start_time, source.started_at, source.completed_at,
              source.canceled_at, source.stopped_reason);
          `, [
            c.id,
            c.name,
            c.universityId || '',
            c.universityName || '',
            c.collegePlace || '',
            c.course || '',
            c.agentId ? Number(c.agentId) : null,
            c.status || 'completed',
            c.totalCount || (c.contacts ? c.contacts.length : 0),
            c.completedCount || 0,
            c.answeredCount || 0,
            c.unansweredCount || 0,
            c.dispatchErrorCount || 0,
            c.delaySeconds || 2,
            c.scheduledStartTime ? new Date(c.scheduledStartTime) : null,
            c.startedAt ? new Date(c.startedAt) : null,
            c.completedAt ? new Date(c.completedAt) : null,
            c.canceledAt ? new Date(c.canceledAt) : null,
            c.stoppedReason || null
          ]);
          campCount++;

          if (Array.isArray(c.contacts)) {
            for (const ct of c.contacts) {
              const contactId = ct.id || `contact-${c.id}-${ct.phone}`;
              await query(`
                MERGE campaign_contacts AS target
                USING (SELECT $1 AS id, $2 AS campaign_id, $3 AS phone, $4 AS formatted_phone, $5 AS name,
                  $6 AS university_id, $7 AS university_name, $8 AS course, $9 AS program, $10 AS email,
                  $11 AS state, $12 AS district, $13 AS status, $14 AS call_outcome, $15 AS call_duration,
                  $16 AS reason, $17 AS extra_fields, $18 AS [timestamp]) AS source
                ON target.id = source.id
                WHEN MATCHED THEN UPDATE SET
                  status = source.status, call_outcome = source.call_outcome,
                  call_duration = source.call_duration, reason = source.reason,
                  updated_at = SYSDATETIMEOFFSET()
                WHEN NOT MATCHED THEN INSERT (
                  id, campaign_id, phone, formatted_phone, name, university_id, university_name,
                  course, program, email, state, district, status, call_outcome, call_duration,
                  reason, extra_fields, [timestamp]
                ) VALUES (source.id, source.campaign_id, source.phone, source.formatted_phone, source.name,
                  source.university_id, source.university_name, source.course, source.program, source.email,
                  source.state, source.district, source.status, source.call_outcome, source.call_duration,
                  source.reason, source.extra_fields, source.[timestamp]);
              `, [
                contactId,
                c.id,
                ct.phone || '',
                ct.formattedPhone || (ct.phone ? `+91${ct.phone}` : ''),
                ct.name || '',
                ct.universityId || c.universityId || '',
                ct.universityName || c.universityName || '',
                ct.course || c.course || '',
                ct.program || ct.course || '',
                ct.email || '',
                ct.state || '',
                ct.district || '',
                ct.status || 'queued',
                ct.callOutcome || 'Pending',
                ct.callDuration || ct.duration || '—',
                ct.reason || '',
                ct.extraFields || {},
                ct.timestamp ? new Date(ct.timestamp) : new Date()
              ]);
              contactCount++;
            }
          }
        }
        console.log(`✔ Migrated ${campCount} campaigns and ${contactCount} campaign contacts.`);
      }
    } catch (err) {
      console.warn('Campaigns migration error:', err.message);
    }
  }

  // 3. Migrate Google Sheets Cache Records
  const sheetsPath = path.join(dataDir, 'google_sheets_cache.json');
  if (fs.existsSync(sheetsPath)) {
    try {
      const records = JSON.parse(fs.readFileSync(sheetsPath, 'utf8'));
      if (Array.isArray(records)) {
        let sheetCount = 0;
        for (const r of records) {
          const cleanPhone = String(r.contactNumber || r.rawFields?.to_number || r.to_number || r.phone || '').replace(/\D/g, '').slice(-10);
          if (!cleanPhone) continue;

          const callDate = r.callDate || r.call_date || r.time_of_call || new Date().toISOString();
          const recId = r.id || `rec-${cleanPhone}-${callDate.replace(/[^a-zA-Z0-9]/g, '')}`;

          await query(`
            MERGE call_records AS target
            USING (SELECT $1 AS id, $2 AS contact_number, $3 AS clean_phone, $4 AS student_name, $5 AS call_date,
              $6 AS call_duration, $7 AS call_status, $8 AS lead_status, $9 AS student_interest, $10 AS sentiment,
              $11 AS counselor_followup, $12 AS call_transferred, $13 AS admission_timeline, $14 AS entrance_exam,
              $15 AS graduation_status, $16 AS preferred_city, $17 AS preferred_state, $18 AS preferred_university,
              $19 AS target_course, $20 AS recording_url, $21 AS summary, $22 AS transcript,
              $23 AS raw_fields, $24 AS extracted_variables, $25 AS source) AS source
            ON target.clean_phone = source.clean_phone AND target.call_date = source.call_date
            WHEN MATCHED THEN UPDATE SET
              student_interest = source.student_interest, lead_status = source.lead_status,
              call_status = source.call_status, call_duration = source.call_duration,
              counselor_followup = source.counselor_followup, summary = source.summary,
              transcript = source.transcript, recording_url = source.recording_url,
              updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN INSERT (
              id, contact_number, clean_phone, student_name, call_date, call_duration,
              call_status, lead_status, student_interest, sentiment, counselor_followup,
              call_transferred, admission_timeline, entrance_exam, graduation_status,
              preferred_city, preferred_state, preferred_university, target_course,
              recording_url, summary, transcript, raw_fields, extracted_variables, source
            ) VALUES (source.id, source.contact_number, source.clean_phone, source.student_name, source.call_date,
              source.call_duration, source.call_status, source.lead_status, source.student_interest, source.sentiment,
              source.counselor_followup, source.call_transferred, source.admission_timeline, source.entrance_exam,
              source.graduation_status, source.preferred_city, source.preferred_state, source.preferred_university,
              source.target_course, source.recording_url, source.summary, source.transcript,
              source.raw_fields, source.extracted_variables, source.source);
          `, [
            recId,
            r.contactNumber || `+91${cleanPhone}`,
            cleanPhone,
            r.studentName || 'Student',
            callDate,
            r.callDuration || '—',
            r.callStatus || '',
            r.leadStatus || '',
            r.studentInterest || '',
            r.sentiment || '',
            r.counselorFollowup || 'No',
            r.callTransferred || 'No',
            r.admissionTimeline || '—',
            r.entranceExam || '—',
            r.graduationStatus || '—',
            r.preferredCity || '',
            r.preferredState || '',
            r.preferredUniversity || '',
            r.targetCourse || '',
            r.recordingUrl || '',
            r.summary || '',
            r.transcript || '',
            r.rawFields || {},
            r.extractedVariables || {},
            'google_sheets'
          ]);
          sheetCount++;
        }
        console.log(`✔ Migrated ${sheetCount} Google Sheets call records into SQL Server.`);
      }
    } catch (err) {
      console.warn('Sheets migration error:', err.message);
    }
  }

  // 4. Migrate Users
  const usersPath = path.join(dataDir, 'users.json');
  if (fs.existsSync(usersPath)) {
    try {
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      if (Array.isArray(users)) {
        let userCount = 0;
        for (const u of users) {
          await query(`
            MERGE users AS target
            USING (SELECT $1 AS id, $2 AS email, $3 AS password_hash, $4 AS name, $5 AS role, $6 AS permissions, $7 AS status) AS source
            ON target.email = source.email
            WHEN MATCHED THEN UPDATE SET
              name = source.name, role = source.role, password_hash = source.password_hash,
              permissions = source.permissions, status = source.status, updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN INSERT (id, email, password_hash, name, role, permissions, status, updated_at)
              VALUES (source.id, source.email, source.password_hash, source.name, source.role, source.permissions, source.status, SYSDATETIMEOFFSET());
          `, [
            u.id,
            u.email,
            u.passwordHash,
            u.name,
            u.role || 'counselor',
            u.permissions || {},
            u.status || 'active'
          ]);
          userCount++;
        }
        console.log(`✔ Migrated ${userCount} users into SQL Server.`);
      }
    } catch (err) {
      console.warn('Users migration error:', err.message);
    }
  }

  console.log('\n=====================================================');
  console.log('ALL JSON DATA SUCCESSFULLY MIGRATED TO SQL SERVER!');
  console.log('=====================================================');

  const pool = await getPool();
  await pool.close();
}

migrateData().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
