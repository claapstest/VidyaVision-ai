import fs from 'fs';
import path from 'path';
import { query, pool } from '../db.js';

async function migrateData() {
  console.log('--- Migrating Existing JSON Data to PostgreSQL ---');
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
            INSERT INTO colleges (id, name, place, agent_id, languages, courses, status, website_url, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              place = EXCLUDED.place,
              agent_id = EXCLUDED.agent_id,
              languages = EXCLUDED.languages,
              courses = EXCLUDED.courses,
              status = EXCLUDED.status,
              website_url = EXCLUDED.website_url,
              description = EXCLUDED.description,
              updated_at = NOW();
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
        console.log(`✔ Migrated ${count} colleges into PostgreSQL.`);
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
            INSERT INTO campaigns (
              id, name, university_id, university_name, college_place, course, agent_id,
              status, total_count, completed_count, answered_count, unanswered_count, dispatch_error_count,
              delay_seconds, scheduled_start_time, started_at, completed_at, canceled_at, stopped_reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (id) DO UPDATE SET
              status = EXCLUDED.status,
              completed_count = EXCLUDED.completed_count,
              answered_count = EXCLUDED.answered_count,
              unanswered_count = EXCLUDED.unanswered_count,
              dispatch_error_count = EXCLUDED.dispatch_error_count,
              completed_at = EXCLUDED.completed_at,
              canceled_at = EXCLUDED.canceled_at,
              stopped_reason = EXCLUDED.stopped_reason,
              updated_at = NOW();
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
                INSERT INTO campaign_contacts (
                  id, campaign_id, phone, formatted_phone, name, university_id, university_name,
                  course, program, email, state, district, status, call_outcome, call_duration,
                  reason, extra_fields, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                ON CONFLICT (id) DO UPDATE SET
                  status = EXCLUDED.status,
                  call_outcome = EXCLUDED.call_outcome,
                  call_duration = EXCLUDED.call_duration,
                  reason = EXCLUDED.reason,
                  updated_at = NOW();
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
            INSERT INTO call_records (
              id, contact_number, clean_phone, student_name, call_date, call_duration,
              call_status, lead_status, student_interest, sentiment, counselor_followup,
              call_transferred, admission_timeline, entrance_exam, graduation_status,
              preferred_city, preferred_state, preferred_university, target_course,
              recording_url, summary, transcript, raw_fields, extracted_variables, source
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
            )
            ON CONFLICT (clean_phone, call_date) DO UPDATE SET
              student_interest = EXCLUDED.student_interest,
              lead_status = EXCLUDED.lead_status,
              call_status = EXCLUDED.call_status,
              call_duration = EXCLUDED.call_duration,
              counselor_followup = EXCLUDED.counselor_followup,
              summary = EXCLUDED.summary,
              transcript = EXCLUDED.transcript,
              recording_url = EXCLUDED.recording_url,
              updated_at = NOW();
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
        console.log(`✔ Migrated ${sheetCount} Google Sheets call records into PostgreSQL.`);
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
            INSERT INTO users (id, email, password_hash, name, role, permissions, status, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (email) DO UPDATE SET
              name = EXCLUDED.name,
              role = EXCLUDED.role,
              password_hash = EXCLUDED.password_hash,
              permissions = EXCLUDED.permissions,
              status = EXCLUDED.status,
              updated_at = NOW();
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
        console.log(`✔ Migrated ${userCount} users into PostgreSQL.`);
      }
    } catch (err) {
      console.warn('Users migration error:', err.message);
    }
  }

  console.log('\n===========================================');
  console.log('ALL JSON DATA SUCCESSFULLY MIGRATED TO PG!');
  console.log('===========================================');
  await pool.end();
}

migrateData().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

