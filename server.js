import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

function getApiKey() {
  dotenv.config();
  // Secrets live in .env only — never hardcode keys here (this file is committed to git).
  return process.env.OMNIDIM_API_KEY || '';
}

function getAgentId() {
  dotenv.config();
  const id = Number(process.env.AGENT_ID);
  return !isNaN(id) && id > 0 ? id : 257941;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const INTERESTS_FILE = path.join(DATA_DIR, 'call_interests.json');
const COLLEGES_FILE = path.join(DATA_DIR, 'colleges.json');
const GOOGLE_SHEETS_CACHE_FILE = path.join(DATA_DIR, 'google_sheets_cache.json');
const CALL_TARGETS_FILE = path.join(DATA_DIR, 'call_targets.json');

const DEFAULT_COLLEGES = [
  {
    id: 'vidyavision',
    name: 'Vidyavision AI Assistant',
    place: 'Hyderabad, Telangana',
    agentId: 257941,
    languages: 'Telugu, English, Hindi, Tamil, Malayalam',
    courses: ['B.Tech CSE', 'B.Tech ECE', 'B.Tech IT', 'MBA'],
    status: 'active',
    websiteUrl: 'https://vidyavision.com/admissions',
    description: 'Multilingual south-region admission outreach.'
  },
  {
    id: 'gitam',
    name: 'GITAM University',
    place: 'Visakhapatnam & Hyderabad',
    agentId: 257941,
    languages: 'English, Hindi',
    courses: ['B.Tech CSE', 'B.Tech ECE', 'MBA'],
    status: 'active',
    websiteUrl: 'https://applications.gitam.edu',
    description: 'GITAM admission queries and course catalog details.'
  },
  {
    id: 'kl',
    name: 'KL University',
    place: 'Vijayawada & Hyderabad',
    agentId: 257941,
    languages: 'English, Hindi',
    courses: ['B.Tech CSE', 'B.Tech ECE', 'MBA'],
    status: 'active',
    websiteUrl: 'https://kluniversity.in/admissions',
    description: 'KL University admission inquiries and course selection.'
  },
  {
    id: 'icfai',
    name: 'ICFAI Foundation for Higher Education',
    place: 'Hyderabad, Telangana',
    agentId: 257941,
    languages: 'English, Hindi',
    courses: ['MBA', 'BBA', 'B.Tech CSE'],
    status: 'active',
    websiteUrl: 'https://ifheindia.org/admissions',
    description: 'ICFAI IFHE Hyderabad admissions wing.'
  },
  {
    id: 'mnr',
    name: 'MNR University',
    place: 'Sangareddy, Telangana',
    agentId: 257941,
    languages: 'Telugu, English, Hindi',
    courses: ['B.Tech CSE', 'B.Tech ECE', 'MBA'],
    status: 'active',
    websiteUrl: 'https://mnrindia.org/admissions',
    description: 'MNR University medical, engineering & general admissions.'
  },
  {
    id: 'mitwpu',
    name: 'MIT WPU',
    place: 'Pune, Maharashtra',
    agentId: 257941,
    languages: 'English, Hindi',
    courses: ['MBA', 'B.Tech CSE', 'B.Tech ECE', 'BBA'],
    status: 'active',
    websiteUrl: 'https://mitwpu.edu.in/admissions',
    description: 'MIT World Peace University admissions outreach.'
  }
];

async function loadColleges() {
  try {
    const raw = await fs.readFile(COLLEGES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_COLLEGES;
}

async function saveColleges(colleges) {
  try {
    await fs.writeFile(COLLEGES_FILE, JSON.stringify(colleges, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save colleges file:', err);
  }
}

let CALL_INTERESTS = {};

// Phone -> campaign target memory (persists across restarts): which college +
// staged name each number was called with. Written at dispatch, read when
// enriching logs so old calls keep their exact college/name forever.
let CALL_TARGETS = {};

async function loadTargets() {
  try {
    const raw = await fs.readFile(CALL_TARGETS_FILE, 'utf8');
    CALL_TARGETS = JSON.parse(raw);
  } catch {
    CALL_TARGETS = {};
  }
}

function rememberCallTarget(formattedPhone, info) {
  const digits = String(formattedPhone || '').replace(/\D/g, '');
  const key = digits.length === 10 ? digits : digits.slice(-10);
  if (!key) return;
  CALL_TARGETS[key] = { ...(CALL_TARGETS[key] || {}), ...info, updatedAt: new Date().toISOString() };
  fs.writeFile(CALL_TARGETS_FILE, JSON.stringify(CALL_TARGETS, null, 2), 'utf8').catch(() => {});
}

function getCallTarget(cleanPhone) {
  return (cleanPhone && CALL_TARGETS[cleanPhone]) || null;
}

async function loadInterests() {
  try {
    const raw = await fs.readFile(INTERESTS_FILE, 'utf8');
    CALL_INTERESTS = JSON.parse(raw);
  } catch {
    CALL_INTERESTS = {};
  }
}

async function saveInterests() {
  try {
    await fs.writeFile(INTERESTS_FILE, JSON.stringify(CALL_INTERESTS, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save call interests:', err);
  }
}

// Session logs to show on the frontend
const LOGS = [];
const PENDING_CALLS = new Map(); // Key: to_number, Value: { fullName, dispatchTime, lastStatus, queueContactId }

// Sequential Calling Campaign Engine State
let CAMPAIGN_STATE = {
  isRunning: false,
  isPaused: false,
  totalCount: 0,
  completedCount: 0,
  answeredCount: 0,
  unansweredCount: 0,
  delayMs: 2000,
  currentContactIndex: -1
};

let CALL_QUEUE = []; // Array of { id, phone, formattedPhone, name, status: 'queued'|'in-progress'|'completed'|'no-answer'|'canceled', duration, reason, dispatchTime }
let CURRENT_CALL = null;
let queueNextTimer = null;

// Helper to format duration to a readable MM:SS layout for logs
function formatDuration(durationStr) {
  if (!durationStr || durationStr === '—') return '0:00';
  const parts = String(durationStr).split(':');
  if (parts.length >= 2) {
    const min = Math.floor(parseFloat(parts[parts.length - 2]));
    const sec = Math.floor(parseFloat(parts[parts.length - 1]));
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }
  return durationStr;
}

function addLog(type, message) {
  const logEntry = {
    id: String(Date.now()) + '-' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    type, // 'info', 'success', 'error', 'warning'
    message
  };
  LOGS.push(logEntry);
  if (LOGS.length > 150) LOGS.shift(); // Keep logs memory clean
  console.log(`[${type.toUpperCase()}] ${message}`);
  broadcast({ type: 'logs', data: LOGS });
}

function broadcastQueueUpdate() {
  broadcast({
    type: 'queue_update',
    data: {
      campaignState: CAMPAIGN_STATE,
      queue: CALL_QUEUE,
      currentCall: CURRENT_CALL
    }
  });
}

// Ensure database file and folder exists
async function initDb() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(REGISTRATIONS_FILE);
    } catch {
      await fs.writeFile(REGISTRATIONS_FILE, JSON.stringify([], null, 2), 'utf8');
      console.log('Created empty registrations database file.');
    }
    try {
      await fs.access(INTERESTS_FILE);
      await loadInterests();
    } catch {
      await saveInterests();
      console.log('Created empty call interests database file.');
    }
    try {
      await fs.access(COLLEGES_FILE);
    } catch {
      await saveColleges(DEFAULT_COLLEGES);
      console.log('Created initial colleges database file.');
    }
  } catch (err) {
    console.error('Failed to initialize database folder/file:', err);
  }
}
await initDb();

// Google Sheets Service Setup
let googleSheetsClient = null;

async function getGoogleSheetsClient() {
  if (googleSheetsClient) return googleSheetsClient;

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.warn('[WARNING] GOOGLE_SPREADSHEET_ID is not configured in .env.');
    return null;
  }

  let credentials = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      console.log('Google Sheets: Loaded credentials from GOOGLE_SERVICE_ACCOUNT_JSON env variable.');
    } catch (err) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err);
    }
  }

  if (!credentials) {
    const credentialPaths = [
      path.join(DATA_DIR, 'service-account.json'),
      path.join(process.cwd(), 'service-account.json'),
      path.join(process.cwd(), 'credentials.json')
    ];
    for (const p of credentialPaths) {
      try {
        const fileContent = await fs.readFile(p, 'utf8');
        credentials = JSON.parse(fileContent);
        console.log(`Google Sheets: Loaded credentials from local file: ${p}`);
        break;
      } catch (err) {
        // search next
      }
    }
  }

  if (credentials) {
    try {
      const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      googleSheetsClient = google.sheets({ version: 'v4', auth });
      console.log('Google Sheets client initialized successfully.');
      return googleSheetsClient;
    } catch (err) {
      console.error('Failed to initialize Google Sheets client:', err);
    }
  }

  return null;
}

async function fetchPublicGoogleSheet(spreadsheetId) {
  const sheetName = process.env.GOOGLE_SHEET_NAME || '';
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${sheetName ? 'sheet=' + encodeURIComponent(sheetName) + '&' : ''}tqx=out:json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Sheets public endpoint returned status ${response.status}`);
  }
  const text = await response.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!match) {
    throw new Error('Failed to parse Google Sheets public response.');
  }
  const data = JSON.parse(match[1]);
  if (data.status === 'error') {
    throw new Error(`Google Sheets returned error: ${JSON.stringify(data.errors)}`);
  }
  
  const rows = data.table.rows.map(r => {
    return r.c.map(cell => (cell ? (cell.v !== null ? cell.v : cell.f || '') : ''));
  });
  
  return rows;
}

async function fetchSheetRawData() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is missing.');
  }

  // 1. Try private API
  try {
    const client = await getGoogleSheetsClient();
    if (client) {
      console.log('Fetching sheet data using Google Private API...');
      const spreadsheetInfo = await client.spreadsheets.get({ spreadsheetId });
      const firstSheetName = spreadsheetInfo.data.sheets[0].properties.title || 'Sheet1';
      const res = await client.spreadsheets.values.get({
        spreadsheetId,
        range: `${firstSheetName}!A:ZZ`,
      });
      return res.data.values || [];
    }
  } catch (err) {
    console.error('Google Sheets Private API failed, trying public fallback:', err.message);
  }

  // 2. Try public gviz API fallback
  try {
    console.log('Fetching sheet data using public endpoint...');
    return await fetchPublicGoogleSheet(spreadsheetId);
  } catch (err) {
    console.error('Google Sheets Public API fallback failed:', err.message);
    throw err;
  }
}

// Product-level status enum schema
const CALL_OUTCOME_STATUS = Object.freeze({
  INTERESTED: 'INTERESTED',
  APPLICATION_SENT: 'APPLICATION_SENT',
  CALLBACK: 'CALLBACK',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  ALREADY_JOINED: 'ALREADY_JOINED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  WRONG_NUMBER_INVALID: 'WRONG_NUMBER_INVALID',
  NOT_ANSWERED: 'NOT_ANSWERED'
});

function resolveFinalCallStatus(item) {
  if (!item) return CALL_OUTCOME_STATUS.NOT_ANSWERED;

  const direct = String(item.final_status || item.finalStatus || '').toUpperCase().trim();
  if (direct && CALL_OUTCOME_STATUS[direct]) return CALL_OUTCOME_STATUS[direct];

  const outcome = String(item.callOutcome || item.call_status || item.status || '').toUpperCase().trim();
  const leadStatus = String(item.leadStatus || item.lead_status || '').toUpperCase().trim();
  const interestLevel = String(item.interestLevel || item.interest_level || '').toUpperCase().trim();
  const callbackReq = String(item.callbackRequired || item.callback_required || '').toLowerCase().trim();

  const fullText = (
    String(item.summary || item.call_summary || '') + ' ' +
    String(item.notes || item.additional_notes || '') + ' ' +
    String(item.call_conversation || item.transcript || item.conversation || '') + ' ' +
    String(item.details || item.interest_details || '') + ' ' +
    String(leadStatus) + ' ' +
    String(outcome)
  ).toLowerCase();

  // 1. Calls Not Answered
  const lowerCallStatus = String(item.call_status || item.status || '').toLowerCase().trim();
  const lowerOutcome = outcome.toLowerCase();
  const unansweredSet = new Set(['failed', 'canceled', 'cancelled', 'busy', 'no-answer', 'no_answer', 'timeout', 'timedout', 'unreachable', 'missed', 'not answered', 'unanswered']);
  if (
    unansweredSet.has(lowerCallStatus) || unansweredSet.has(lowerOutcome) ||
    outcome.includes('NO ANSWER') || outcome.includes('NO-ANSWER') || outcome.includes('MISSED') ||
    outcome.includes('FAILED') || outcome.includes('BUSY') || outcome.includes('UNREACHABLE') ||
    outcome.includes('CANCEL') || outcome.includes('TIMEOUT') ||
    leadStatus === 'NO_ANSWER' || leadStatus === 'NOT ANSWERED' || leadStatus === 'UNANSWERED' ||
    interestLevel === 'NO_ANSWER' || outcome === 'NO_ANSWER'
  ) {
    return CALL_OUTCOME_STATUS.NOT_ANSWERED;
  }

  // 2. Wrong Number / Invalid
  const wrongNumberKeywords = ['wrong number', 'wrong person', 'invalid number', 'not the right person', 'wrong contact', 'not my number', 'mistaken number', 'incorrect number', 'does not belong', 'fake number', 'out of service'];
  if (leadStatus.includes('WRONG') || leadStatus.includes('INVALID') || outcome.includes('WRONG') || outcome.includes('INVALID') || wrongNumberKeywords.some(kw => fullText.includes(kw))) {
    return CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID;
  }

  // 2b. Application Sent (WhatsApp admission link already sent / confirmed)
  const appSentKeywords = ['application sent', 'app sent', 'whatsapp sent', 'sent application link', 'sent app link', 'sent link via whatsapp', 'application link sent', 'admission link sent'];
  if (leadStatus.includes('APPLICATION_SENT') || leadStatus.includes('APPLICATION SENT') || leadStatus.includes('APP SENT') || leadStatus.includes('WHATSAPP SENT') || outcome.includes('APPLICATION_SENT') || outcome.includes('APPLICATION SENT') || appSentKeywords.some(kw => fullText.includes(kw))) {
    return CALL_OUTCOME_STATUS.APPLICATION_SENT;
  }

  // 3. Already Joined
  const alreadyJoinedKeywords = ['already joined', 'already enrolled', 'already taken admission', 'already admitted', 'already taken', 'joined another college', 'joined college', 'joined university', 'currently studying in another college', 'enrolled in another', 'joined degree'];
  if (leadStatus.includes('ALREADY_JOINED') || leadStatus.includes('ALREADY JOINED') || leadStatus.includes('ENROLLED') || outcome.includes('ALREADY_JOINED') || outcome.includes('ALREADY JOINED') || alreadyJoinedKeywords.some(kw => fullText.includes(kw))) {
    return CALL_OUTCOME_STATUS.ALREADY_JOINED;
  }

  // 4. Already Applied
  const alreadyAppliedKeywords = ['already applied', 'applied already', 'application submitted', 'submitted application', 'already submitted form', 'form already submitted', 'already filled application', 'filled application', 'applied online', 'application pending'];
  if (leadStatus.includes('ALREADY_APPLIED') || leadStatus.includes('ALREADY APPLIED') || outcome.includes('ALREADY_APPLIED') || outcome.includes('ALREADY APPLIED') || alreadyAppliedKeywords.some(kw => fullText.includes(kw))) {
    return CALL_OUTCOME_STATUS.ALREADY_APPLIED;
  }

  // 5. Callback
  const callbackKeywords = ['callback', 'call back', 'call later', 'call me later', 'call tomorrow', 'reach out later', 'talk later', 'busy right now call later', 'contact later', 'call again', 'schedule a call', 'call after'];
  if (callbackReq === 'yes' || callbackReq === 'true' || leadStatus.includes('CALLBACK') || leadStatus.includes('CALL_BACK') || leadStatus.includes('CALL BACK') || outcome.includes('CALLBACK') || outcome.includes('CALL_BACK') || outcome.includes('CALL BACK') || callbackKeywords.some(kw => fullText.includes(kw))) {
    return CALL_OUTCOME_STATUS.CALLBACK;
  }

  // 6. Not Interested
  const notInterestedKeywords = ['not interested', 'no interest', 'dont call', "don't call", 'do not call', 'no thanks', 'not looking', 'reject', 'cancel', 'not planning', 'no need', 'doing a job', 'doing job', 'working', 'already working', 'doing work', 'im working', "i'm working", 'im doing a job', "i'm doing a job", 'employed', 'not required', 'bad timing', 'stop calling'];
  if (leadStatus === 'NOT INTERESTED' || leadStatus === 'NOT_INTERESTED' || leadStatus === 'DECLINED' || interestLevel === 'NOT INTERESTED' || interestLevel === 'NOT_INTERESTED' || interestLevel === 'LOW' || outcome.includes('NOT INTERESTED') || outcome.includes('NOT_INTERESTED') || outcome.includes('DECLINED') || notInterestedKeywords.some(kw => fullText.includes(kw))) {
    return CALL_OUTCOME_STATUS.NOT_INTERESTED;
  }

  // 7. Explicit Interest
  const interestedKeywords = ['interested in college', 'looking for college', 'want admission', 'want to join', 'tell me fees', 'send details', 'send me the details', 'send the details', 'details in whatsapp', 'details on whatsapp', 'send it on whatsapp', 'send it to my whatsapp', 'whatsapp me', 'message me on whatsapp', 'on my whatsapp', 'send application', 'send the application', 'send me the application', 'application link', 'admission link', 'application of', 'fee structure', 'which college', 'which course', 'want to take admission', 'looking for admission', 'connect me with counselor', 'to join', 'whatsapp link', 'send me the link', 'send the link', 'share the link', 'జాయిన్', 'ఫీజు'];
  // Interest must come from the CALLER's speech — never the agent's greeting.
  const __userParts = [];
  if (Array.isArray(item.interactions)) {
    item.interactions.forEach(t => {
      if (t && t.user_query && String(t.user_query).trim()) __userParts.push(String(t.user_query).trim());
    });
  }
  const __conv = item.call_conversation || item.transcript || item.conversation || '';
  if (typeof __conv === 'string' && __conv) {
    __conv.replace(/<br\s*\/?>/gi, '\n').split('\n').forEach(line => {
      const __m = line.match(/^\s*user\s*:(.*)$/i);
      if (__m && __m[1].trim()) __userParts.push(__m[1].trim());
    });
  }
  const __userText = __userParts.join(' ').toLowerCase();
  const __interestText = __userText || fullText;
  if (leadStatus === 'INTERESTED' || leadStatus === 'HOT LEAD' || leadStatus === 'QUALIFIED' || leadStatus.includes('HOT') || interestLevel === 'HIGH' || interestLevel === 'INTERESTED' || interestedKeywords.some(kw => __interestText.includes(kw))) {
    return CALL_OUTCOME_STATUS.INTERESTED;
  }

  // 8. Answered call fallback: if completed without positive interest, mark NOT_INTERESTED
  if (lowerCallStatus === 'completed' || outcome.includes('COMPLETED') || outcome.includes('ANSWERED')) {
    if (__userText && (interestLevel === 'MEDIUM' || String(item.sentiment || '').toLowerCase() === 'positive')) {
      return CALL_OUTCOME_STATUS.INTERESTED;
    }
    return CALL_OUTCOME_STATUS.NOT_INTERESTED;
  }

  return CALL_OUTCOME_STATUS.NOT_ANSWERED;
}

function normalizeRow(row, headers) {
  const findValue = (keywords) => {
    const cleanHeaders = headers.map(h => String(h || '').trim().toLowerCase().replace(/_/g, ' '));
    const cleanKeywords = keywords.map(k => String(k || '').trim().toLowerCase().replace(/_/g, ' '));

    // 1. Exact match priority
    for (const kw of cleanKeywords) {
      const idx = cleanHeaders.findIndex(h => h === kw);
      if (idx !== -1 && row[idx] !== undefined && row[idx] !== null && String(row[idx]).trim() !== '' && String(row[idx]).trim().toLowerCase() !== 'null') {
        return String(row[idx]).trim();
      }
    }

    // 2. Partial match priority (skip generic match on bot_name if searching student name/name)
    for (const kw of cleanKeywords) {
      const idx = cleanHeaders.findIndex(h => h.includes(kw));
      if (idx !== -1 && row[idx] !== undefined && row[idx] !== null && String(row[idx]).trim() !== '' && String(row[idx]).trim().toLowerCase() !== 'null') {
        const headerName = cleanHeaders[idx];
        if (kw === 'name' && headerName.includes('bot')) {
          continue; // Skip bot name when we seek student name
        }
        return String(row[idx]).trim();
      }
    }
    return '';
  };

  const studentName = findValue(['student name', 'fullname', 'name']) || 'Student';
  const contactNumber = findValue(['to number', 'contact number', 'phone number', 'mobile', 'phone', 'number', 'recipient']) || '—';
  const email = findValue(['email address', 'email', 'mail']) || '—';
  const program = findValue(['program type', 'program', 'degree']) || '—';
  const course = findValue(['preferred course', 'course', 'specialization', 'branch', 'program interest', 'program_interest', 'program']) || '—';
  const preferredState = findValue(['preferred state', 'state']) || '—';
  const preferredCity = findValue(['preferred city', 'city']) || '—';
  const leadStatus = findValue(['lead status', 'status', 'qualification']) || '—';
  const interestLevel = findValue(['interest level', 'interest status', 'interest']) || '—';
  const counselorRequired = findValue(['counselor required', 'counselor follow-up', 'counselor requirement', 'counselor', 'counsellor required', 'counsellor follow-up', 'counsellor follow up', 'counsellor requirement', 'counsellor']) || '—';
  const callbackRequired = findValue(['callback required', 'callback']) || '—';
  const callDate = findValue(['call date', 'timestamp', 'date', 'call time', 'registered_at']) || '—';
  const callOutcome = findValue(['call outcome', 'outcome', 'status']) || '—';
  const questionsAsked = findValue(['questions asked', 'questions', 'query']) || '—';
  const universitiesDiscussed = findValue(['universities discussed', 'colleges discussed', 'universities', 'colleges', 'college interest', 'college_interest', 'college discussed']) || '—';
  const summary = findValue(['conversation summary', 'summary', 'call summary', 'transcript']) || '—';
  const notes = findValue(['additional notes', 'notes']) || '—';
  const entranceExam = findValue(['entrance exam', 'exam']) || '—';
  const educationStatus = findValue(['education status', 'education', 'qualification']) || '—';

  // Extra vital fields mapped explicitly
  const recordingUrl = findValue(['recording url', 'recording_url']);
  const transferStatus = findValue(['call transfered status', 'call_transfered_status', 'transfer']);
  const preferredUniversity = findValue(['preferred university', 'preferred_university', 'university', 'college interest', 'college_interest', 'college']);
  const sentiment = findValue(['sentiment']);
  const botName = findValue(['bot name', 'bot_name']);
  const fullConversation = findValue(['full conversation', 'full_conversation', 'conversation']);
  // No name column in these sheets — recover the student's name from the greeting.
  const recoveredName = extractStudentName({ call_conversation: fullConversation, summary });

  const rawFields = {};
  headers.forEach((h, i) => {
    if (h) {
      rawFields[h] = row[i] !== undefined ? String(row[i]).trim() : '';
    }
  });

  let id = findValue(['call id', 'call_id']) || findValue(['lead id', 'lead_id']);

  let final_status = resolveFinalCallStatus({
    callOutcome,
    leadStatus,
    interestLevel,
    callbackRequired,
    summary,
    notes,
    sentiment,
    call_status: callOutcome
  });

  let effectiveLeadStatus = leadStatus;

  // Explicit per-call verdict flags from the sheet (interested /
  // application_sent / callback / already_applied / already_joined /
  // not_interested / wrong_invalid columns) always win over keyword
  // guessing, so the dashboard mirrors the sheet exactly. Most advanced
  // outcome wins when several flags are set together.
  const flagYes = (keywords) => String(findValue(keywords)).trim().toLowerCase() === 'yes';
  const flagStatus =
    flagYes(['wrong invalid', 'wrong_invalid', 'wrong number']) ? CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID :
    flagYes(['already joined', 'already_joined']) ? CALL_OUTCOME_STATUS.ALREADY_JOINED :
    flagYes(['already applied', 'already_applied']) ? CALL_OUTCOME_STATUS.ALREADY_APPLIED :
    flagYes(['application sent', 'application_sent']) ? CALL_OUTCOME_STATUS.APPLICATION_SENT :
    flagYes(['callback']) ? CALL_OUTCOME_STATUS.CALLBACK :
    flagYes(['not interested', 'not_interested']) ? CALL_OUTCOME_STATUS.NOT_INTERESTED :
    flagYes(['interested']) ? CALL_OUTCOME_STATUS.INTERESTED : '';
  if (flagStatus) {
    final_status = flagStatus;
    effectiveLeadStatus = flagStatus;
  }

  // Manual overrides (e.g. APPLICATION_SENT after WhatsApp) so dashboard calculus updates
  const cleanPhone = contactNumber.replace(/\D/g, '').slice(-10);
  const manual = (cleanPhone && CALL_INTERESTS[cleanPhone]) || (id && CALL_INTERESTS[id]);
  if (manual && manual.interestStatus) {
    final_status = manual.interestStatus;
    effectiveLeadStatus = manual.interestStatus;
  }

  // Campaign target memory: exact college this number was called with
  const target = getCallTarget(cleanPhone);
  let effectivePreferredUniversity = preferredUniversity;
  let effectiveDiscussed = universitiesDiscussed;
  if (target && target.collegeName && (!preferredUniversity || preferredUniversity === '—')) {
    effectivePreferredUniversity = target.collegeName;
  }
  if (target && target.collegeName && (!universitiesDiscussed || universitiesDiscussed === '—')) {
    effectiveDiscussed = target.collegeName;
  }

  return {
    id,
    studentName: recoveredName || studentName,
    contactNumber,
    email,
    program,
    course,
    preferredState,
    preferredCity,
    leadStatus: effectiveLeadStatus,
    interestLevel,
    final_status,
    finalStatus: final_status,
    counselorRequired,
    callbackRequired,
    callDate,
    callOutcome,
    questionsAsked,
    universitiesDiscussed: effectiveDiscussed,
    summary,
    notes,
    entranceExam,
    educationStatus,
    recordingUrl,
    transferStatus,
    preferredUniversity: effectivePreferredUniversity,
    sentiment,
    botName,
    call_conversation: fullConversation,
    rawFields
  };
}

async function loadCache() {
  try {
    const raw = await fs.readFile(GOOGLE_SHEETS_CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveCache(data) {
  try {
    // Guard: never let a partial/failed fetch wipe a healthy cache. If the new
    // payload is less than half the cached size (and cache is non-trivial),
    // keep the old cache — a Sheet cleanup this drastic needs a human look.
    let prevLen = 0;
    try {
      const raw = await fs.readFile(GOOGLE_SHEETS_CACHE_FILE, 'utf8');
      const prev = JSON.parse(raw);
      prevLen = Array.isArray(prev) ? prev.length : 0;
    } catch {}
    if (prevLen > 5 && Array.isArray(data) && data.length < prevLen * 0.5) {
      console.warn(`Sheets cache guard: fresh fetch has ${data.length} rows vs cached ${prevLen} — keeping cache.`);
      return false;
    }
    await fs.writeFile(GOOGLE_SHEETS_CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save cache file:', err);
    return false;
  }
}

// Polling Google Sheets
let sheetsPollInterval = null;
let lastSheetsDataJson = '';

// Load cached sheets data into memory on startup
loadCache().then(cached => {
  if (cached && cached.length > 0) {
    lastSheetsDataJson = JSON.stringify(cached);
  }
}).catch(() => {});
loadInterests().catch(() => {});
loadTargets().catch(() => {});

async function pollGoogleSheets() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) return;

  try {
    const rawData = await fetchSheetRawData();
    const normalizedList = [];

    if (rawData && rawData.length > 0) {
      const headers = rawData[0];
      const rows = rawData.slice(1);
      const seenIds = new Set();
      
      rows.forEach((row, index) => {
        if (!row || row.length === 0) return;
        const item = normalizeRow(row, headers);
        if (!item.id) {
          const cleanPhone = item.contactNumber.replace(/\D/g, '');
          const cleanDate = item.callDate.replace(/[^a-zA-Z0-9]/g, '');
          item.id = `row-${index}-${cleanPhone}-${cleanDate}`;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          normalizedList.push(item);
        }
      });
    }

    const recordsJson = JSON.stringify(normalizedList);
    if (recordsJson !== lastSheetsDataJson) {
      const saved = await saveCache(normalizedList);
      if (saved === false) return; // guard kept the healthy cache; retry next poll
      console.log('Detected new/updated Google Sheets records. Broadcasting...');
      lastSheetsDataJson = recordsJson;
      broadcast({ type: 'sheets_update', data: normalizedList });
    }
  } catch (err) {
    console.warn('Background Google Sheets polling failed:', err.message);
  }
}

function extractTranscriptText(callRecord) {
  if (!callRecord) return '';
  const raw = callRecord.call_conversation || callRecord.transcript || callRecord.conversation || callRecord.summary || callRecord.call_summary || callRecord.dialogue || callRecord.analysis || '';

  if (Array.isArray(raw)) {
    return raw.map(item => {
      if (typeof item === 'string') return item;
      const speaker = item.speaker || item.role || item.from || 'Speaker';
      const text = item.text || item.content || item.message || '';
      return `${speaker}: ${text}`;
    }).join('\n');
  }

  if (typeof raw === 'object' && raw !== null) {
    return JSON.stringify(raw);
  }

  return String(raw || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

// USER's own speech only (agent greetings like "Are you interested...?" must
// never count as the caller's interest). Falls back to '' when unknown.
function extractUserSpeech(callRecord) {
  if (!callRecord) return '';
  const parts = [];
  if (Array.isArray(callRecord.interactions)) {
    callRecord.interactions.forEach(t => {
      if (t && t.user_query && String(t.user_query).trim()) parts.push(String(t.user_query).trim());
    });
  }
  const conv = callRecord.call_conversation || callRecord.transcript || callRecord.conversation || '';
  if (typeof conv === 'string' && conv) {
    conv.replace(/<br\s*\/?>/gi, '\n').split('\n').forEach(line => {
      const m = line.match(/^\s*user\s*:(.*)$/i);
      if (m && m[1].trim()) parts.push(m[1].trim());
    });
  }
  return parts.join(' ').toLowerCase();
}

// Student name recovery: OmniDimension exposes no per-call student name
// (user_name is the account holder), so recover it from the call itself —
// self-stated ("my name is X") first, then the bot's personalized greeting
// ("Hello <name>", "<name> garu").
function extractStudentName(callRecord) {
  if (!callRecord) return '';
  const userText = extractUserSpeech(callRecord);
  const fullText = extractTranscriptText(callRecord);
  const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

  // 1. Caller stating their own name (highest confidence)
  const selfM = userText.match(/\bmy name is\s+([a-z][a-z'.\- ]{1,40})/i);
  if (selfM) {
    const name = titleCase(selfM[1].split(/[.,!?]/)[0]).split(/\s+/).filter((w) => !/^(and|uh|um|er|ah|yeah)$/i.test(w)).slice(0, 4).join(' ');
    if (/^[A-Za-z][A-Za-z .'\-]{1,40}$/.test(name)) return name;
  }

  // 2. Telugu honorific: "<name> garu" (e.g. "కార్తిక్ గారు")
  const teM = (fullText.slice(0, 600) + ' ' + userText.slice(0, 300)).match(/([\u0C00-\u0C7F]{2,20})\s*గార[ుూ]/);
  if (teM) return teM[1];

  // 3. Bot greeting the dialled contact by name ("Hello vittal, ...")
  const greetM = fullText.slice(0, 600).match(/\b(?:hello|hi|hey|namaste|namaskar)[,!]?\s+([a-z]{2,20})\b/i);
  if (greetM) {
    const word = greetM[1].toLowerCase();
    const stop = new Set(['there', 'sir', 'maam', 'madam', 'everyone', 'all', 'dear', 'friend', 'how', 'what', 'can', 'may', 'welcome', 'thanks', 'thank', 'good', 'morning', 'evening', 'afternoon', 'today', 'this', 'that', 'these', 'those', 'is', 'are', 'you', 'your', 'we', 'our', 'iam', 'im']);
    if (!stop.has(word)) return titleCase(word);
  }
  return '';
}

// Intelligent Post-Call Interest & Preference Analyzer (Strict real call data)
function analyzeCallInterest(callRecord) {
  if (!callRecord) return { interestStatus: 'PENDING', college: '—', course: '—', details: 'No call data recorded' };

  const phone = callRecord.to_number || callRecord.phone_number || callRecord.to || callRecord.formattedPhone || callRecord.phone || '';
  const name = callRecord.name || callRecord.fullName || callRecord.student_name || (phone ? `Recipient (${phone})` : 'Recipient');
  const status = (callRecord.call_status || callRecord.status || '').toLowerCase();
  
  const transcriptText = extractTranscriptText(callRecord);
  const summaryText = String(callRecord.summary || callRecord.call_summary || '').toLowerCase();
  const fullText = (transcriptText + ' ' + summaryText).toLowerCase().trim();
  const hasTranscript = fullText.length > 0;

  // 1. If NO transcript exists and call was not completed:
  if (!hasTranscript) {
    if (['failed', 'canceled', 'busy', 'no-answer', 'no_answer', 'timeout', 'unreachable'].includes(status)) {
      return {
        interestStatus: CALL_OUTCOME_STATUS.NOT_ANSWERED,
        final_status: CALL_OUTCOME_STATUS.NOT_ANSWERED,
        college: '—',
        course: '—',
        details: `${name} did not answer call.`
      };
    }
    return {
      interestStatus: CALL_OUTCOME_STATUS.NOT_ANSWERED,
      final_status: CALL_OUTCOME_STATUS.NOT_ANSWERED,
      college: '—',
      course: '—',
      details: `${name} call pending / no conversation recorded yet.`
    };
  }

  // 1b. Answered but the caller said NOTHING (hung up mid-greeting):
  // that is NOT interest, no matter what the agent said.
  const userText = extractUserSpeech(callRecord);
  if (!userText && (status === 'completed' || fullText.length > 0)) {
    return {
      interestStatus: CALL_OUTCOME_STATUS.NOT_INTERESTED,
      final_status: CALL_OUTCOME_STATUS.NOT_INTERESTED,
      college: 'Not Mentioned in Call',
      course: 'Not Mentioned in Call',
      details: `${name} hung up without responding during the call.`
    };
  }

  // 2. Specific outcome keywords for mutually exclusive classification
  // (negative outcomes read the whole conversation; INTEREST reads user speech only)
  const wrongNumberKeywords = [
    'wrong number', 'wrong person', 'invalid number', 'not the right person', 
    'wrong contact', 'not my number', 'mistaken number', 'incorrect number', 'does not belong'
  ];

  const alreadyJoinedKeywords = [
    'already joined', 'already enrolled', 'already taken admission', 'already admitted', 
    'already taken', 'joined another college', 'joined college', 'joined university', 
    'currently studying in another college', 'enrolled in another'
  ];

  const alreadyAppliedKeywords = [
    'already applied', 'applied already', 'application submitted', 'submitted application', 
    'already submitted form', 'form already submitted', 'already filled application', 
    'filled application', 'applied online', 'application pending'
  ];

  const callbackKeywords = [
    'callback', 'call back', 'call later', 'call me later', 'call tomorrow', 
    'reach out later', 'talk later', 'busy right now call later', 'contact later', 
    'call again', 'schedule a call', 'call after'
  ];

  const notInterestedKeywords = [
    'not interested', 'no interest', 'dont call', "don't call", 'do not call', 
    'no thanks', 'not looking', 'reject', 'cancel', 'not planning', 'no need', 
    'doing a job', 'doing job', 'working', 'already working', 'doing work', 
    'im working', "i'm working", 'im doing a job', "i'm doing a job", 'employed', 
    'not required', 'bad timing', 'stop calling'
  ];

  // 3. Explicit Interest keywords (user asking for application/admission link counts as interest)
  const interestedKeywords = [
    'interested in college', 'looking for college', 'want admission', 'want to join',
    'tell me fees', 'send details', 'send me the details', 'send the details',
    'details in whatsapp', 'details on whatsapp', 'send it on whatsapp', 'send it to my whatsapp',
    'whatsapp me', 'message me on whatsapp', 'on my whatsapp',
    'send application', 'send the application',
    'send me the application', 'send admission', 'application link', 'admission link',
    'application of', 'send me application link', 'fee structure', 'which college', 'which course',
    'b.tech', 'btech', 'cse', 'ece', 'mba', 'computer science', 'information technology',
    'to join', 'whatsapp link', 'send me the link', 'send the link', 'share the link',
    'జాయిన్', 'ఫీజు'
  ];

  const isWrongNumber = wrongNumberKeywords.some(kw => fullText.includes(kw));
  const isAlreadyJoined = alreadyJoinedKeywords.some(kw => fullText.includes(kw));
  const isAlreadyApplied = alreadyAppliedKeywords.some(kw => fullText.includes(kw));
  const isCallback = callbackKeywords.some(kw => fullText.includes(kw)) || String(callRecord.callback_required || callRecord.callbackRequired || '').toLowerCase().includes('yes');
  const isNotInterested = notInterestedKeywords.some(kw => fullText.includes(kw));
  
  let finalStatus = CALL_OUTCOME_STATUS.NOT_INTERESTED;
  let college = 'Not Mentioned in Call';
  let course = 'Not Mentioned in Call';
  let detailsStr = '';

  if (isWrongNumber) {
    finalStatus = CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID;
    college = 'Invalid Contact';
    course = 'Invalid Contact';
    detailsStr = `${name} flagged as wrong/invalid contact number.`;
  } else if (isAlreadyJoined) {
    finalStatus = CALL_OUTCOME_STATUS.ALREADY_JOINED;
    college = 'Already Enrolled';
    course = 'Already Enrolled';
    detailsStr = `${name} stated already joined / enrolled in a university.`;
  } else if (isAlreadyApplied) {
    finalStatus = CALL_OUTCOME_STATUS.ALREADY_APPLIED;
    college = 'Already Applied';
    course = 'Already Applied';
    detailsStr = `${name} stated already submitted admission application.`;
  } else if (isCallback) {
    finalStatus = CALL_OUTCOME_STATUS.CALLBACK;
    detailsStr = `${name} requested a callback to discuss admission details later.`;
  } else if (isNotInterested) {
    finalStatus = CALL_OUTCOME_STATUS.NOT_INTERESTED;
    college = 'Not Interested';
    course = 'Not Interested';

    if (fullText.includes('doing a job') || fullText.includes('doing job') || fullText.includes('working') || fullText.includes('employed') || fullText.includes('doing work')) {
      detailsStr = `${name} stated currently working / doing a job (Not looking for college).`;
    } else {
      detailsStr = `${name} stated NOT interested in college admissions during call.`;
    }
  } else {
    // Detect college name spoken in transcript (misspellings included: geetham = gitam)
    const collegeHints = [
      ['mit wpu', 'MIT WPU'],
      ['mitwpu', 'MIT WPU'],
      ['mit-wpu', 'MIT WPU'],
      ['geetham', 'GITAM University'],
      ['gitam', 'GITAM University'],
      ['kl university', 'KL University'],
      ['klu', 'KL University'],
      ['woxsen', 'Woxsen University'],
      ['icfai', 'ICFAI Foundation for Higher Education'],
      ['ifhe', 'ICFAI Foundation for Higher Education'],
      ['vidyavision', 'Vidyavision AI Assistant'],
      ['cbit', 'CBIT Hyderabad'],
      ['vit', 'VIT Vellore'],
      ['srm', 'SRM University'],
      ['manipal', 'Manipal University'],
      ['amrita', 'Amrita University'],
      ['bits', 'BITS Pilani'],
      ['jntu', 'JNTU Hyderabad']
    ];
    for (const [hint, label] of collegeHints) {
      if (fullText.includes(hint)) { college = label; break; }
    }

    // Check if course spoken in transcript (bare "ai"/"it" need word boundaries:
    // "application" must NOT match AI, "with/visit" must NOT match IT)
    const hasStandaloneAI = /\bai\b/.test(fullText);
    const hasStandaloneIT = /\bit\b/.test(fullText);
    if (fullText.includes('cse') || fullText.includes('computer science')) course = 'B.Tech CSE';
    else if (fullText.includes('data science') || fullText.includes('machine learning') || fullText.includes('aiml') || fullText.includes('artificial intelligence') || hasStandaloneAI) course = 'AI & Data Science';
    else if (fullText.includes('ece') || fullText.includes('electronics')) course = 'B.Tech ECE';
    else if (fullText.includes('mba') || fullText.includes('management')) course = 'MBA';
    else if (hasStandaloneIT || fullText.includes('information technology')) course = 'B.Tech IT';
    else if (fullText.includes('mech') || fullText.includes('mechanical')) course = 'B.Tech Mech';
    else if (fullText.includes('civil')) course = 'B.Tech Civil';

    const interestText = userText || fullText;
    const isExplicitlyInterested = interestedKeywords.some(kw => interestText.includes(kw)) ||
      String(callRecord.interestLevel || callRecord.interest_level || '').toUpperCase() === 'HIGH' ||
      String(callRecord.leadStatus || callRecord.lead_status || '').toUpperCase() === 'INTERESTED';

    if (isExplicitlyInterested) {
      finalStatus = CALL_OUTCOME_STATUS.INTERESTED;
      if (college !== 'Not Mentioned in Call' && course !== 'Not Mentioned in Call') {
        detailsStr = `${name} expressed interest in ${course} at ${college} during call.`;
      } else if (college !== 'Not Mentioned in Call') {
        detailsStr = `${name} asked for the ${college} application during call.`;
      } else if (course !== 'Not Mentioned in Call') {
        detailsStr = `${name} expressed interest in ${course} during call.`;
      } else {
        detailsStr = `${name} confirmed interest in college admission during call.`;
      }
    } else {
      // Completed call without explicit interest is Not Interested / General Query
      finalStatus = CALL_OUTCOME_STATUS.NOT_INTERESTED;
      detailsStr = `${name} call completed without positive admission interest.`;
    }
  }

  return {
    interestStatus: finalStatus,
    final_status: finalStatus,
    college,
    course,
    details: detailsStr
  };
}

function enrichCallWithInterest(callRecord) {
  const phone = String(callRecord.to_number || callRecord.phone_number || callRecord.contactNumber || callRecord.to || callRecord.phone || '').replace(/\D/g, '');
  const cleanPhone = phone.length === 10 ? phone : phone.slice(-10);
  const callId = String(callRecord.id || callRecord.call_id || '').trim();

  const applyTargetMemory = (out, manualEntry) => {
    // Campaign target memory: exact college + staged name this number was
    // called with (survives restarts; transcript-detected college still wins).
    const target = getCallTarget(cleanPhone);
    if (!target) return out;
    const targetNewer = manualEntry?.updatedAt && target.updatedAt
      && new Date(target.updatedAt).getTime() > new Date(manualEntry.updatedAt).getTime();
    if ((!out.college || /Not Mentioned|Invalid Contact/.test(out.college)) || targetNewer) {
      // Newer campaign record corrects a stale saved college (e.g. number
      // re-called under a different college).
      out.college = target.collegeName || out.college;
    }
    if ((!out.target_college || /Not Mentioned|Invalid Contact/.test(out.target_college)) || targetNewer) {
      out.target_college = target.collegeName || out.target_college;
    }
    if (targetNewer && out.details && target.applicationUrl) {
      out.details = `${out.details} [College corrected to ${target.collegeName} from campaign record. Apply: ${target.applicationUrl}]`;
      out.interest_details = out.details;
    }
    if (target.course && (!out.target_course || out.target_course === 'Not Mentioned in Call')) {
      out.target_course = target.course;
    }
    if (target.course && (!out.course || out.course === 'Not Mentioned in Call')) {
      out.course = target.course;
    }
    if (!out.studentName) out.studentName = target.name || out.studentName;
    return out;
  };

  // Manual overrides (e.g. APPLICATION_SENT after WhatsApp) win over transcript analysis
  const manual = (cleanPhone && CALL_INTERESTS[cleanPhone]) || (callId && CALL_INTERESTS[callId]);
  // ...unless a NEWER call with a real transcript exists: fresh evidence beats a
  // stale saved status (e.g. old Submitted must not resurrect onto a hang-up).
  let useFresh = false;
  if (manual && manual.interestStatus && manual.updatedAt) {
    const callTime = new Date(callRecord.time_of_call || callRecord.call_date || 0).getTime();
    const manualTime = new Date(manual.updatedAt).getTime();
    const hasFreshTranscript = (typeof callRecord.call_conversation === 'string' && callRecord.call_conversation.trim())
      || (Array.isArray(callRecord.interactions) && callRecord.interactions.length > 0);
    if (!isNaN(callTime) && !isNaN(manualTime) && callTime > manualTime && hasFreshTranscript) {
      useFresh = true;
    }
  }
  if (manual && manual.interestStatus && !useFresh) {
    const status = manual.interestStatus;
    const analyzed = analyzeCallInterest(callRecord);
    return applyTargetMemory({
      ...callRecord,
      ...analyzed,
      final_status: status,
      finalStatus: status,
      interest_status: status,
      interestStatus: status,
      leadStatus: status,
      lead_status: status,
      college: manual.college || analyzed.college,
      course: manual.course && !/�/.test(manual.course) ? manual.course : analyzed.course,
      details: manual.details || manual.notes || analyzed.details,
      target_college: manual.college || analyzed.college,
      target_course: manual.course && !/�/.test(manual.course) ? manual.course : analyzed.course,
      interest_details: manual.details || manual.notes || analyzed.details,
      summary: manual.notes ? `${callRecord.summary || ''} [Notes: ${manual.notes}]` : callRecord.summary
    }, manual);
  }

  const interestData = analyzeCallInterest(callRecord);

  // OmniDimension's own structured verdict (extracted_variables) wins over
  // keyword guessing — it is the same source that feeds the Google Sheet,
  // so live rows and sheet rows classify identically.
  const ev = callRecord.extracted_variables || {};
  const evYes = (k) => String(ev[k] ?? '').trim().toLowerCase() === 'yes';
  const evStatus =
    evYes('wrong_invalid') ? CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID :
    evYes('already_joined') ? CALL_OUTCOME_STATUS.ALREADY_JOINED :
    evYes('already_applied') ? CALL_OUTCOME_STATUS.ALREADY_APPLIED :
    evYes('application_sent') ? CALL_OUTCOME_STATUS.APPLICATION_SENT :
    evYes('callback') ? CALL_OUTCOME_STATUS.CALLBACK :
    evYes('not_interested') ? CALL_OUTCOME_STATUS.NOT_INTERESTED :
    (evYes('Interested') || evYes('interested')) ? CALL_OUTCOME_STATUS.INTERESTED : '';
  if (evStatus) interestData.interestStatus = evStatus;

  // Recover the student's name (user_name is the account holder, not the student).
  const recoveredLiveName = extractStudentName(callRecord);

  return applyTargetMemory({
    ...callRecord,
    ...interestData,
    ...(recoveredLiveName ? { studentName: recoveredLiveName } : {}),
    final_status: interestData.interestStatus,
    finalStatus: interestData.interestStatus,
    interest_status: interestData.interestStatus,
    target_college: interestData.college,
    target_course: interestData.course,
    interest_details: interestData.details
  }, null);
}

function buildAdmissionMessage({ studentName, collegeName, applicationUrl }) {
  const name = (studentName || 'Student').trim() || 'Student';
  const college = (collegeName || 'our college').trim() || 'our college';
  const link = (applicationUrl || '').trim();
  return (
    `Hi ${name}! Thanks for your interest in ${college} (via VidyaVision AI call).` +
    (link ? `\nApply here: ${link}` : '') +
    `\nReply to this message if you need help with courses, fees, or counselling.`
  );
}

// NOTE: OmniDimension has no WhatsApp-send REST API (every messaging path
// returns 404). Delivery is owned by the agent's Post-Call Cloud WhatsApp
// action — never attempt HTTP delivery from here.

async function maybeAutoSendWhatsApp(matchedCall, pending) {
  // NOTE: OmniDimension exposes NO WhatsApp-send REST endpoint, so this backend
  // does not attempt HTTP delivery. The real WhatsApp goes out via the AGENT's
  // Post-Call Cloud WhatsApp action. Here we only record the outcome so the
  // dashboard flips to APPLICATION_SENT the moment interest is detected.
  try {
    const enriched = enrichCallWithInterest(matchedCall || {});
    if (enriched.interestStatus !== CALL_OUTCOME_STATUS.INTERESTED) return null;
    const rawPhone = matchedCall.to_number || matchedCall.phone_number || matchedCall.to || pending?.phone || '';
    const digits = String(rawPhone).replace(/\D/g, '');
    const cleanPhone = digits.length === 10 ? digits : digits.slice(-10);
    if (!cleanPhone) return null;
    // Skip only if the stored APPLICATION_SENT entry is newer than this call
    // (stale entries from older calls must still trigger a fresh record).
    const existing = CALL_INTERESTS[cleanPhone];
    if (existing?.interestStatus === CALL_OUTCOME_STATUS.APPLICATION_SENT && existing.updatedAt) {
      try {
        const callTime = new Date(matchedCall.time_of_call || matchedCall.call_date || 0).getTime();
        if (!isNaN(callTime) && new Date(existing.updatedAt).getTime() >= callTime) return null;
      } catch {}
    }

    const studentName = matchedCall.name || matchedCall.student_name || matchedCall.fullName || pending?.fullName || 'Student';
    // Prefer the college actually named in the transcript (e.g. user asked for
    // GITAM while campaign ran under Vidyavision) with its own admission link.
    let collegeName = pending?.collegeName || CAMPAIGN_STATE.universityName || enriched.target_college || 'our college';
    let applicationUrl = pending?.applicationUrl || CAMPAIGN_STATE.applicationUrl || '';
    const transcriptCollege = enriched.target_college || enriched.college;
    if (transcriptCollege && transcriptCollege !== 'Not Mentioned in Call' && !/invalid|already|not interested/i.test(transcriptCollege)) {
      try {
        const colleges = await loadColleges();
        const hit = colleges.find(c => c.name.toLowerCase() === transcriptCollege.toLowerCase());
        if (hit) {
          collegeName = hit.name;
          applicationUrl = hit.websiteUrl || applicationUrl;
        } else {
          collegeName = transcriptCollege;
        }
      } catch {}
    }

    const message = buildAdmissionMessage({ studentName, collegeName, applicationUrl });
    const toNumber = rawPhone.startsWith('+') ? rawPhone : `+91${cleanPhone}`;
    const entry = {
      interestStatus: CALL_OUTCOME_STATUS.APPLICATION_SENT,
      college: collegeName,
      course: enriched.target_course || 'Not Mentioned in Call',
      notes: `${message} [Delivery: agent Post-Call Cloud WhatsApp]`,
      details: `${studentName} showed interest; admission link goes via agent Post-Call Cloud WhatsApp (${collegeName}).`,
      studentName,
      applicationUrl,
      updatedAt: new Date().toISOString()
    };
    CALL_INTERESTS[cleanPhone] = entry;
    const callId = String(matchedCall.id || matchedCall.call_id || '').trim();
    if (callId) CALL_INTERESTS[callId] = entry;
    await saveInterests();
    addLog('success', `Interested lead ${toNumber} (${collegeName}) — admission link via agent Post-Call Cloud WhatsApp. Dashboard → APPLICATION_SENT.`);
    return entry;
  } catch (err) {
    console.error('maybeAutoSendWhatsApp failed:', err);
    return null;
  }
}

// WebSocket Server Setup
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

let lastCallsJson = '';
let pollInterval = null;

async function fetchCallsFromOmni() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }
  const target = `https://backend.omnidim.io/api/v1/calls/logs?pageno=1&pagesize=50`;
  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`OmniDimension API error (${response.status}): ${errText}`);
      return null;
    }
    const data = await response.json();
    const rawCalls = data.call_log_data || data.calls || data.data || data || [];
    if (Array.isArray(rawCalls)) {
      return rawCalls.map(c => enrichCallWithInterest(c));
    }
    return [];
  } catch (error) {
    console.error('Error fetching calls from OmniDimension:', error);
    return null;
  }
}

// Handle completion of a call in queue and trigger next contact
function handleQueueContactFinished(contact, isAnswered, statusText, durationStr) {
  if (!contact) return;

  contact.duration = durationStr || '0:00';
  if (isAnswered) {
    contact.status = 'completed';
    CAMPAIGN_STATE.answeredCount++;
    addLog('success', `Sequential Call [${contact.index + 1}/${CAMPAIGN_STATE.totalCount}] to "${contact.name || contact.formattedPhone}" (${contact.formattedPhone}) COMPLETED. Result: ANSWERED. Duration: ${contact.duration}.`);
  } else {
    contact.status = 'no-answer';
    contact.reason = statusText;
    CAMPAIGN_STATE.unansweredCount++;
    addLog('error', `Sequential Call [${contact.index + 1}/${CAMPAIGN_STATE.totalCount}] to "${contact.name || contact.formattedPhone}" (${contact.formattedPhone}) ENDED. Result: NOT ANSWERED (${statusText}).`);
  }

  CAMPAIGN_STATE.completedCount++;
  CURRENT_CALL = null;
  broadcastQueueUpdate();

  if (isAnswered) {
    // Push fresh data immediately so the dashboard shows this call at once:
    // re-check Omni (late transcript/analysis) and re-poll Sheets.
    pollGoogleSheets().catch(() => {});
    setTimeout(() => { pollCallsOnce().catch(() => {}); }, 10000);
    setTimeout(() => { pollCallsOnce().catch(() => {}); }, 30000);
  }

  // Schedule next contact after delay (enforcing minimum 5s buffer for OmniDimension channel cooldown)
  if (CAMPAIGN_STATE.isRunning && !CAMPAIGN_STATE.isPaused) {
    const effectiveDelay = Math.max(CAMPAIGN_STATE.delayMs, 5000);
    addLog('info', `Waiting ${effectiveDelay / 1000}s telephony channel cooldown buffer before initiating next call...`);
    queueNextTimer = setTimeout(processNextInQueue, effectiveDelay);
  }
}

async function pollCallsOnce() {
  if (wss.clients.size === 0 && PENDING_CALLS.size === 0) return;
  const calls = await fetchCallsFromOmni();
  if (!calls || !Array.isArray(calls)) return;

  // Process pending call dispatches to capture status changes (completed/no-answer/ringing/in-progress).
  // Match priority: (1) Omni's call_request_id from the dispatch response —
  // exact, immune to redials and clock skew. (2) Fallback: logs newer than the
  // dispatch, parsed as BOTH UTC and local time (Omni timestamps carry no zone).
  const parseLogTime = (v) => {
    if (!v) return NaN;
    const s = String(v).trim();
    const asLocal = new Date(s).getTime();
    const asUtc = new Date(s.includes('GMT') || s.includes('Z') || s.includes('+') ? s : s + ' UTC').getTime();
    return { asLocal, asUtc };
  };
  for (const [phone, pending] of PENDING_CALLS.entries()) {
    const samePhone = calls.filter(c => {
      const cPhone = c.to_number || c.phone_number || c.to || '';
      return cPhone === phone;
    });

    let matchedCall = null;
    if (pending.requestId) {
      matchedCall = samePhone.find(c => {
        const rid = c.call_request_id && (c.call_request_id.id || c.call_request_id.request_id);
        return rid !== undefined && rid !== null && String(rid) === String(pending.requestId);
      }) || null;
    }
    if (!matchedCall) {
      const fresh = samePhone.filter(c => {
        const { asLocal, asUtc } = parseLogTime(c.time_of_call);
        if (isNaN(asLocal) && isNaN(asUtc)) return true;
        const okLocal = !isNaN(asLocal) && asLocal >= pending.dispatchTime - 5 * 60 * 1000;
        const okUtc = !isNaN(asUtc) && asUtc >= pending.dispatchTime - 5 * 60 * 1000;
        return okLocal || okUtc;
      });
      fresh.sort((a, b) => {
        const ta = parseLogTime(a.time_of_call);
        const tb = parseLogTime(b.time_of_call);
        return Math.max(tb.asLocal || 0, tb.asUtc || 0) - Math.max(ta.asLocal || 0, ta.asUtc || 0);
      });
      matchedCall = fresh[0] || null;
    }

    if (matchedCall) {
      const rawStatus = matchedCall.call_status || matchedCall.status || '';
      const currentStatus = rawStatus.toLowerCase();
      const rawDuration = matchedCall.call_duration || matchedCall.duration || '—';
      const formattedDuration = formatDuration(rawDuration);

      if (currentStatus !== pending.lastStatus) {
        if (currentStatus === 'completed') {
          PENDING_CALLS.delete(phone);
          updateWsPolling();

          const queueContact = CALL_QUEUE.find(q => q.id === pending.queueContactId || q.formattedPhone === phone);
          if (queueContact && queueContact.status === 'in-progress') {
            handleQueueContactFinished(queueContact, true, 'completed', formattedDuration);
          } else {
            addLog('success', `Call to "${pending.fullName}" (${phone}) COMPLETED. Duration: ${formattedDuration}.`);
            pollGoogleSheets().catch(() => {});
            setTimeout(() => { pollCallsOnce().catch(() => {}); }, 10000);
            setTimeout(() => { pollCallsOnce().catch(() => {}); }, 30000);
          }
          // Auto-send WhatsApp admission link when transcript shows INTERESTED
          maybeAutoSendWhatsApp(matchedCall, pending).catch(() => {});
        } else if (['failed', 'canceled', 'busy', 'no-answer', 'no_answer'].includes(currentStatus)) {
          const displayStatus = currentStatus.replace('_', ' ');
          PENDING_CALLS.delete(phone);
          updateWsPolling();

          const queueContact = CALL_QUEUE.find(q => q.id === pending.queueContactId || q.formattedPhone === phone);
          if (queueContact && queueContact.status === 'in-progress') {
            handleQueueContactFinished(queueContact, false, displayStatus, formattedDuration);
          } else {
            addLog('error', `Call to "${pending.fullName}" (${phone}) ended. Result: NOT ANSWERED (${displayStatus}).`);
          }
        } else if (['ringing', 'in-progress', 'in_progress', 'queued'].includes(currentStatus)) {
          const displayStatus = currentStatus.replace('_', ' ');
          addLog('info', `Call to "${pending.fullName || phone}" (${phone}) is now ${displayStatus}.`);
          pending.lastStatus = currentStatus;
        } else {
          addLog('info', `Call to "${pending.fullName || phone}" (${phone}) changed status to: ${currentStatus}.`);
          pending.lastStatus = currentStatus;
        }
      }
    } else {
      // Omni posts call logs with a delay (often 1-4 min after hang-up for
      // recording/analysis/post-actions). Keep waiting up to 8 minutes so a
      // slow log never strands the queue as "dialing" forever.
      const waitedSec = Math.floor((Date.now() - pending.dispatchTime) / 1000);
      if (waitedSec > 150 && !pending.waitingLogged) {
        pending.waitingLogged = true;
        addLog('info', `Still waiting for the call log of "${pending.fullName}" (${phone}) — Omni publishes it a few minutes after hang-up. Queue stays on this contact.`);
      }
      if (Date.now() - pending.dispatchTime > 480000) {
        PENDING_CALLS.delete(phone);
        updateWsPolling();

        const queueContact = CALL_QUEUE.find(q => q.id === pending.queueContactId || q.formattedPhone === phone);
        if (queueContact && queueContact.status === 'in-progress') {
          handleQueueContactFinished(queueContact, false, 'timeout', '0:00');
        } else {
          addLog('error', `Call status tracking for "${pending.fullName}" (${phone}) timed out.`);
        }
      }
    }
  }

  const callsJson = JSON.stringify(calls);
  if (callsJson !== lastCallsJson) {
    lastCallsJson = callsJson;
    broadcast({ type: 'calls', data: calls });
  }
}

function updateWsPolling() {
  const needsOmniPolling = PENDING_CALLS.size > 0 || CAMPAIGN_STATE.isRunning;
  if (needsOmniPolling) {
    if (!pollInterval) {
      pollInterval = setInterval(pollCallsOnce, 3500);
      pollCallsOnce();
    }
  } else {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Google Sheets background polling tied to active dashboard clients
  const needsSheetsPolling = wss.clients.size > 0;
  if (needsSheetsPolling) {
    if (!sheetsPollInterval) {
      sheetsPollInterval = setInterval(pollGoogleSheets, 45000);
      pollGoogleSheets(); // Run once immediately
    }
  } else {
    if (sheetsPollInterval) {
      clearInterval(sheetsPollInterval);
      sheetsPollInterval = null;
    }
  }
}

// Sequential Execution Processor
async function processNextInQueue() {
  if (queueNextTimer) {
    clearTimeout(queueNextTimer);
    queueNextTimer = null;
  }

  if (!CAMPAIGN_STATE.isRunning || CAMPAIGN_STATE.isPaused) {
    broadcastQueueUpdate();
    return;
  }

  const nextIndex = CALL_QUEUE.findIndex(c => c.status === 'queued');
  if (nextIndex === -1) {
    CAMPAIGN_STATE.isRunning = false;
    CAMPAIGN_STATE.isPaused = false;
    CURRENT_CALL = null;
    addLog('success', `🎉 Campaign Complete! All ${CAMPAIGN_STATE.totalCount} contacts have been called sequentially.`);
    addLog('info', `Campaign Summary: ${CAMPAIGN_STATE.answeredCount} Answered, ${CAMPAIGN_STATE.unansweredCount} Not Answered / Failed.`);
    broadcastQueueUpdate();
    return;
  }

  const contact = CALL_QUEUE[nextIndex];
  contact.index = nextIndex;
  contact.status = 'in-progress';
  contact.dispatchTime = Date.now();
  CURRENT_CALL = contact;
  CAMPAIGN_STATE.currentContactIndex = nextIndex;

  broadcastQueueUpdate();

  const nameDisplay = contact.name ? `"${contact.name}"` : 'Not provided';
  const universityDisplay = CAMPAIGN_STATE.universityName || 'Vidyavision AI Admission Assistant';
  const activeAgentId = CAMPAIGN_STATE.agentId || getAgentId();
  const apiKey = getApiKey();
  addLog('info', `Sequential Dialing [${nextIndex + 1}/${CAMPAIGN_STATE.totalCount}] using ${universityDisplay} (Agent ID: ${activeAgentId}): Initiating call to ${contact.formattedPhone} (Name: ${nameDisplay})...`);

  if (!apiKey) {
    addLog('error', 'OMNIDIM_API_KEY is missing! Call dispatch aborted.');
    handleQueueContactFinished(contact, false, 'api_key_missing', '0:00');
    return;
  }

  try {
    const collegeName = CAMPAIGN_STATE.universityName || 'Vidyavision AI';
    const collegePlace = CAMPAIGN_STATE.collegePlace || '';
    const applicationUrl = CAMPAIGN_STATE.applicationUrl || '';
    const targetCourse = contact.course || CAMPAIGN_STATE.course || '';
    const studentName = contact.name || 'Student';
    // Explicit self-introduction line so the agent always says the selected
    // college name first, even if its dashboard prompt is generic.
    const agentIntro = `You are calling from ${collegeName}${collegePlace ? `, ${collegePlace}` : ''}${targetCourse ? ` about ${targetCourse} admissions` : ''}. Introduce yourself as calling from ${collegeName} and answer only about ${collegeName} admissions unless the caller asks about other colleges.`;
    const dispatchPayload = {
      agent_id: activeAgentId,
      to_number: contact.formattedPhone,
      call_context: {
        student_name: studentName,
        name: studentName,
        user_name: studentName,
        college_name: collegeName,
        university_name: collegeName,
        target_college: collegeName,
        college_place: collegePlace,
        target_course: targetCourse,
        course: targetCourse,
        application_url: applicationUrl,
        admission_link: applicationUrl,
        whatsapp_link: applicationUrl,
        agent_intro: agentIntro,
        agent_identity: agentIntro
      },
      dynamic_variables: {
        student_name: studentName,
        college_name: collegeName,
        university_name: collegeName,
        target_college: collegeName,
        college_place: collegePlace,
        target_course: targetCourse,
        course: targetCourse,
        application_url: applicationUrl,
        admission_link: applicationUrl,
        whatsapp_link: applicationUrl,
        agent_intro: agentIntro,
        agent_identity: agentIntro
      }
    };

    const targetUrl = 'https://backend.omnidim.io/api/v1/calls/dispatch';
    const dispatchResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dispatchPayload)
    });

    const responseData = await dispatchResponse.json().catch(() => ({}));

    if (dispatchResponse.ok) {
      addLog('info', `Call dispatched to ${contact.formattedPhone}. Monitoring call status until answered or ended...`);
      PENDING_CALLS.set(contact.formattedPhone, {
        fullName: contact.name || contact.formattedPhone,
        phone: contact.formattedPhone,
        collegeName: CAMPAIGN_STATE.universityName || '',
        universityId: CAMPAIGN_STATE.universityId || contact.universityId || '',
        applicationUrl: CAMPAIGN_STATE.applicationUrl || '',
        requestId: responseData.requestId || responseData.request_id || responseData.id || null,
        dispatchTime: Date.now(),
        lastStatus: 'dispatched',
        queueContactId: contact.id
      });
      updateWsPolling();
    } else {
      const errorMsg = responseData.detail || responseData.error || `HTTP ${dispatchResponse.status}`;

      // Auto-retry on OmniDimension concurrency limit / line busy error
      if (errorMsg.includes('concurrency') || errorMsg.includes('limit') || dispatchResponse.status === 429) {
        contact.retryCount = (contact.retryCount || 0) + 1;
        if (contact.retryCount <= 3) {
          contact.status = 'queued';
          CURRENT_CALL = null;
          addLog('warning', `OmniDimension line busy for ${contact.formattedPhone} (Concurrency Cooldown). Retrying call in 5 seconds (Attempt ${contact.retryCount}/3)...`);
          broadcastQueueUpdate();
          queueNextTimer = setTimeout(processNextInQueue, 5000);
          return;
        }
      }

      addLog('error', `OmniDimension Dispatch API failed for ${contact.formattedPhone}: ${errorMsg}`);
      handleQueueContactFinished(contact, false, `dispatch_failed: ${errorMsg}`, '0:00');
    }
  } catch (err) {
    addLog('error', `Network failure during dispatch to ${contact.formattedPhone}: ${err.message}`);
    handleQueueContactFinished(contact, false, 'network_error', '0:00');
  }
}

wss.on('connection', (ws) => {
  updateWsPolling();
  
  // Immediately send cached Google Sheets data so dashboard loads instantly
  loadCache().then(cached => {
    ws.send(JSON.stringify({ type: 'sheets_update', data: cached }));
  }).catch(() => {});

  // Send current logs, calls, and queue state
  ws.send(JSON.stringify({ type: 'logs', data: LOGS }));
  ws.send(JSON.stringify({
    type: 'queue_update',
    data: {
      campaignState: CAMPAIGN_STATE,
      queue: CALL_QUEUE,
      currentCall: CURRENT_CALL
    }
  }));

  if (lastCallsJson) {
    try {
      ws.send(JSON.stringify({ type: 'calls', data: JSON.parse(lastCallsJson) }));
    } catch {}
  } else {
    pollCallsOnce();
  }

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'reload_calls') {
        const calls = await fetchCallsFromOmni();
        if (calls) {
          lastCallsJson = JSON.stringify(calls);
          ws.send(JSON.stringify({ type: 'calls', data: calls }));
        }
      }
    } catch (err) {
      console.error('WS client message error:', err);
    }
  });

  ws.on('close', () => {
    updateWsPolling();
  });
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/stream') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Helper to validate and format Indian mobile number
function validateAndFormatMobile(mobile) {
  if (!mobile) return null;
  const str = String(mobile).trim();
  const clean = str.replace(/\D/g, '');
  if (clean.length === 10 && clean[0] !== '0') {
    return `+91${clean}`;
  }
  if (clean.length === 11 && clean[0] === '0' && clean[1] !== '0') {
    return `+91${clean.slice(1)}`;
  }
  if (clean.length === 12 && clean.startsWith('91')) {
    return `+${clean}`;
  }
  if (str.startsWith('+') && clean.length >= 10 && clean.length <= 15) {
    return `+${clean}`;
  }
  return null;
}

// Initial status logs
console.log(`[INFO] OmniDimension Server Ready. Agent ID: ${getAgentId()}`);
if (!getApiKey()) {
  console.error('[ERROR] OMNIDIM_API_KEY is not defined in .env! Call dispatches will fail.');
} else {
  console.log('[INFO] OMNIDIM_API_KEY authenticated successfully.');
}

// REST Endpoints

// 0. Colleges Management API (GET, POST, DELETE)
app.get('/api/colleges', async (req, res) => {
  try {
    const list = await loadColleges();
    res.json({ success: true, data: list, colleges: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/colleges', async (req, res) => {
  try {
    const { name, place, websiteUrl, description, agentId, languages, courses, id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'College name is required.' });
    }
    const normCourses = (v) => Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean)
      : String(v || '').split(',').map(x => x.trim()).filter(Boolean);

    const currentList = await loadColleges();

    // Edit mode: update existing college in place (keeps id, createdAt, status)
    if (id) {
      const idx = currentList.findIndex(c => c.id === id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'College not found.' });
      }
      const existing = currentList[idx];
      currentList[idx] = {
        ...existing,
        name: name.trim(),
        place: place !== undefined ? String(place).trim() || 'India' : existing.place,
        agentId: agentId ? Number(agentId) : existing.agentId,
        languages: languages !== undefined ? String(languages).trim() || existing.languages : existing.languages,
        courses: courses !== undefined ? normCourses(courses) : (existing.courses || []),
        websiteUrl: websiteUrl !== undefined ? String(websiteUrl).trim() : existing.websiteUrl,
        description: description !== undefined ? String(description).trim() : existing.description,
        updatedAt: new Date().toISOString()
      };
      await saveColleges(currentList);
      broadcast({ type: 'colleges', data: currentList });

      addLog('success', `Updated college: "${currentList[idx].name}" (${id})`);
      return res.json({ success: true, college: currentList[idx], colleges: currentList, data: currentList });
    }

    const newId = `college-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newCollege = {
      id: newId,
      name: name.trim(),
      place: place ? place.trim() : 'India',
      agentId: Number(agentId) || getAgentId(),
      languages: languages && String(languages).trim() ? String(languages).trim() : 'English, Hindi, Telugu',
      courses: normCourses(courses),
      status: 'active',
      websiteUrl: websiteUrl ? websiteUrl.trim() : '',
      description: description ? description.trim() : '',
      createdAt: new Date().toISOString()
    };

    const updatedList = [newCollege, ...currentList];
    await saveColleges(updatedList);
    broadcast({ type: 'colleges', data: updatedList });

    addLog('success', `Added new college: "${newCollege.name}" (Agent ID: ${newCollege.agentId})`);
    res.json({ success: true, college: newCollege, colleges: updatedList, data: updatedList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/colleges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentList = await loadColleges();
    const target = currentList.find(c => c.id === id);
    if (!target) {
      return res.status(404).json({ success: false, error: 'College not found.' });
    }

    const updatedList = currentList.filter(c => c.id !== id);
    await saveColleges(updatedList);
    broadcast({ type: 'colleges', data: updatedList });

    addLog('warning', `Deleted college: "${target.name}" (${id})`);
    res.json({ success: true, deletedId: id, colleges: updatedList, data: updatedList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Batch & Sequential Calling API
app.post('/api/queue/start', (req, res) => {
  const { contacts, delaySeconds, agentId, universityName, universityId, collegePlace, applicationUrl, course } = req.body;

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    addLog('error', 'Batch call failed: No contacts provided.');
    return res.status(400).json({ error: 'Please provide at least one contact to start dialing.' });
  }

  // Validate and parse contacts
  const parsedQueue = [];
  const invalidCount = 0;

  contacts.forEach((c, idx) => {
    const formatted = validateAndFormatMobile(c.phone);
    if (formatted) {
      parsedQueue.push({
        id: `contact-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        phone: c.phone,
        formattedPhone: formatted,
        name: c.name ? String(c.name).trim() : '',
        universityId: universityId ? String(universityId) : '',
        universityName: universityName ? String(universityName) : '',
        course: (c.course ? String(c.course).trim() : '') || (course ? String(course).trim() : ''),
        status: 'queued',
        duration: '—',
        reason: ''
      });
    }
  });

  if (parsedQueue.length === 0) {
    addLog('error', 'Batch call failed: No valid phone numbers found in list.');
    return res.status(400).json({ error: 'No valid mobile numbers found in submission.' });
  }

  // Reset campaign state
  CALL_QUEUE = parsedQueue;
  CURRENT_CALL = null;
  CAMPAIGN_STATE = {
    isRunning: true,
    isPaused: false,
    totalCount: parsedQueue.length,
    completedCount: 0,
    answeredCount: 0,
    unansweredCount: 0,
    delayMs: (Number(delaySeconds) || 2) * 1000,
    currentContactIndex: -1,
    agentId: agentId ? Number(agentId) : getAgentId(),
    universityId: universityId ? String(universityId) : '',
    universityName: universityName ? String(universityName) : 'Vidyavision AI Admission Assistant',
    collegePlace: collegePlace ? String(collegePlace) : '',
    applicationUrl: applicationUrl ? String(applicationUrl) : '',
    course: course ? String(course).trim() : ''
  };

  const universityDisplay = CAMPAIGN_STATE.universityName;
  const activeAgentId = CAMPAIGN_STATE.agentId || getAgentId();
  addLog('success', `Campaign initialized for ${universityDisplay} (Agent ID: ${activeAgentId}) with ${parsedQueue.length} contacts! Starting sequential calling...`);
  broadcastQueueUpdate();

  // Remember which college + name each number was called with (persists restarts)
  parsedQueue.forEach(ct => rememberCallTarget(ct.formattedPhone, {
    name: ct.name || '',
    collegeName: CAMPAIGN_STATE.universityName || '',
    universityId: CAMPAIGN_STATE.universityId || '',
    applicationUrl: CAMPAIGN_STATE.applicationUrl || '',
    course: ct.course || CAMPAIGN_STATE.course || ''
  }));

  // Kick off sequential execution
  processNextInQueue();

  res.json({
    success: true,
    message: `Started sequential calling campaign with ${parsedQueue.length} contacts.`,
    totalCount: parsedQueue.length
  });
});

// 2. Pause Sequential Queue
app.post('/api/queue/pause', (req, res) => {
  if (!CAMPAIGN_STATE.isRunning) {
    return res.status(400).json({ error: 'No campaign is currently running.' });
  }

  CAMPAIGN_STATE.isPaused = true;
  if (queueNextTimer) {
    clearTimeout(queueNextTimer);
    queueNextTimer = null;
  }
  addLog('warning', 'Sequential calling campaign PAUSED.');
  broadcastQueueUpdate();
  res.json({ success: true, message: 'Campaign paused.' });
});

// 3. Resume Sequential Queue
app.post('/api/queue/resume', (req, res) => {
  if (!CAMPAIGN_STATE.isRunning) {
    return res.status(400).json({ error: 'No active campaign to resume.' });
  }

  CAMPAIGN_STATE.isPaused = false;
  addLog('info', 'Sequential calling campaign RESUMED.');
  broadcastQueueUpdate();

  if (!CURRENT_CALL) {
    processNextInQueue();
  }

  res.json({ success: true, message: 'Campaign resumed.' });
});

// 4. Cancel/Stop Sequential Queue
app.post('/api/queue/cancel', (req, res) => {
  if (queueNextTimer) {
    clearTimeout(queueNextTimer);
    queueNextTimer = null;
  }

  CAMPAIGN_STATE.isRunning = false;
  CAMPAIGN_STATE.isPaused = false;
  
  CALL_QUEUE.forEach(c => {
    if (c.status === 'queued' || c.status === 'in-progress') {
      c.status = 'canceled';
      c.reason = 'User stopped campaign';
    }
  });

  CURRENT_CALL = null;
  addLog('warning', 'Sequential calling campaign CANCELLED by user.');
  broadcastQueueUpdate();
  res.json({ success: true, message: 'Campaign cancelled.' });
});

// 5. Get Campaign & Queue Status
app.get('/api/queue/status', (req, res) => {
  res.json({
    success: true,
    campaignState: CAMPAIGN_STATE,
    queue: CALL_QUEUE,
    currentCall: CURRENT_CALL
  });
});

// 6. Get registration logs
app.get('/api/logs', (req, res) => {
  res.json({ logs: LOGS });
});

// 7. Clear registration logs
app.post('/api/logs/clear', (req, res) => {
  LOGS.length = 0;
  addLog('info', 'Activity logs cleared.');
  res.json({ success: true, logs: LOGS });
});

// 8. Get recent call logs from OmniDimension
app.get('/api/calls', async (req, res) => {
  const calls = await fetchCallsFromOmni();
  if (calls) {
    res.json({ success: true, data: calls });
  } else {
    res.status(502).json({ error: 'Could not fetch calls from OmniDimension' });
  }
});

// 9. Get call interests map
app.get('/api/calls/interests', (req, res) => {
  res.json({ success: true, data: CALL_INTERESTS });
});

// 10. Update or manually set call interest and preferences
app.post('/api/calls/interest', async (req, res) => {
  const { phone, callId, interestStatus, college, course, notes, studentName } = req.body;
  if (!phone && !callId) {
    return res.status(400).json({ error: 'Phone number or call ID is required.' });
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  const key = cleanPhone || callId;

  const updatedEntry = {
    interestStatus: interestStatus || 'PENDING',
    college: college && college.trim() ? college.trim() : (['NOT_INTERESTED', 'WRONG_NUMBER', 'ALREADY_JOINED', 'ALREADY_APPLIED', 'APPLICATION_SENT'].includes(interestStatus) ? interestStatus.replace('_', ' ') : 'Not Mentioned in Call'),
    course: course && course.trim() ? course.trim() : (['NOT_INTERESTED', 'WRONG_NUMBER', 'ALREADY_JOINED', 'ALREADY_APPLIED', 'APPLICATION_SENT'].includes(interestStatus) ? interestStatus.replace('_', ' ') : 'Not Mentioned in Call'),
    notes: notes ? String(notes).trim() : '',
    details: notes && notes.trim() ? notes.trim() : (() => {
      const name = studentName || 'Student';
      if (interestStatus === 'APPLICATION_SENT') return `${name} was sent the college application link via WhatsApp.`;
      if (interestStatus === 'CALLBACK') return `${name} requested a callback to discuss admission details later.`;
      if (interestStatus === 'ALREADY_JOINED') return `${name} stated already joined/enrolled in another institution.`;
      if (interestStatus === 'ALREADY_APPLIED') return `${name} stated already submitted admission application.`;
      if (interestStatus === 'WRONG_NUMBER') return `${name} flagged as invalid/wrong phone number.`;
      if (interestStatus === 'NOT_INTERESTED') return `${name} stated NOT interested in admissions.`;
      return `${name} expressed interest${course ? ` in ${course}` : ''}${college ? ` at ${college}` : ' in college admission'}.`;
    })(),
    updatedAt: new Date().toISOString()
  };

  CALL_INTERESTS[key] = updatedEntry;
  if (callId) CALL_INTERESTS[callId] = updatedEntry;

  await saveInterests();
  addLog('success', `Updated interest record for ${studentName || key}: Status=${updatedEntry.interestStatus}, College=${updatedEntry.college}, Course=${updatedEntry.course}`);

  // Broadcast updated calls over WebSocket
  const calls = await fetchCallsFromOmni();
  if (calls) {
    lastCallsJson = JSON.stringify(calls);
    broadcast({ type: 'calls', data: calls });
  }

  res.json({ success: true, data: updatedEntry });
});

// 10b. Manually send WhatsApp admission link (retry button / post-call action)
app.post('/api/calls/send-whatsapp', async (req, res) => {
  try {
    const { phone, studentName, collegeName, universityId, applicationUrl } = req.body;
    const digits = String(phone || '').replace(/\D/g, '');
    const cleanPhone = digits.length === 10 ? digits : digits.slice(-10);
    if (!cleanPhone) return res.status(400).json({ success: false, error: 'Valid phone number is required.' });

    let resolvedCollege = (collegeName || '').trim();
    let resolvedUrl = (applicationUrl || '').trim();
    if (!resolvedCollege || !resolvedUrl) {
      const colleges = await loadColleges();
      const match = colleges.find(c =>
        (universityId && c.id === universityId) ||
        (resolvedCollege && c.name.toLowerCase() === resolvedCollege.toLowerCase())
      ) || colleges.find(c => c.id === universityId) || colleges[0];
      if (match) {
        if (!resolvedCollege) resolvedCollege = match.name;
        if (!resolvedUrl) resolvedUrl = match.websiteUrl || '';
      }
    }
    if (!resolvedCollege) resolvedCollege = CAMPAIGN_STATE.universityName || 'our college';
    if (!resolvedUrl) resolvedUrl = CAMPAIGN_STATE.applicationUrl || '';

    const message = buildAdmissionMessage({ studentName, collegeName: resolvedCollege, applicationUrl: resolvedUrl });
    const toNumber = `+91${cleanPhone}`;
    // Delivery is owned by the agent's Post-Call Cloud WhatsApp action (there
    // is no OmniDimension WhatsApp-send API). This endpoint records the intent
    // so the dashboard flips to APPLICATION_SENT.
    const sendResult = 'delivery via agent Post-Call Cloud WhatsApp';

    const entry = {
      interestStatus: CALL_OUTCOME_STATUS.APPLICATION_SENT,
      college: resolvedCollege,
      course: CALL_INTERESTS[cleanPhone]?.course || 'Not Mentioned in Call',
      notes: `${message} [${sendResult}]`,
      details: `${studentName || 'Student'} was sent the ${resolvedCollege} application link via WhatsApp (${sendResult}).`,
      studentName: studentName || CALL_INTERESTS[cleanPhone]?.studentName || 'Student',
      applicationUrl: resolvedUrl,
      updatedAt: new Date().toISOString()
    };
    CALL_INTERESTS[cleanPhone] = entry;
    await saveInterests();
    addLog('success', `WhatsApp admission link for "${resolvedCollege}" recorded for ${toNumber} (${sendResult}). Dashboard updated to APPLICATION_SENT.`);
    res.json({ success: true, data: entry, sendResult, message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get call analytics from Google Sheets (Primary Source of Truth)
app.get('/api/call-analytics', async (req, res) => {
  const force = req.query.force === 'true';
  try {
    let records = [];
    if (force) {
      console.log('Force refresh requested. Querying Google Sheets...');
      const rawData = await fetchSheetRawData();
      if (rawData && rawData.length > 0) {
        const headers = rawData[0];
        const rows = rawData.slice(1);
        const seenIds = new Set();
        const normalizedList = [];
        rows.forEach((row, index) => {
          if (!row || row.length === 0) return;
          const item = normalizeRow(row, headers);
          if (!item.id) {
            const cleanPhone = item.contactNumber.replace(/\D/g, '');
            const cleanDate = item.callDate.replace(/[^a-zA-Z0-9]/g, '');
            item.id = `row-${index}-${cleanPhone}-${cleanDate}`;
          }
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            normalizedList.push(item);
          }
        });
        records = normalizedList;
      }
      const saved = await saveCache(records);
      if (saved === false) {
        const cached = await loadCache();
        return res.json({
          success: true,
          source: 'cache_kept',
          error: `Fresh sheet fetch returned only ${records.length} rows — kept the last healthy cache (${cached.length} records). If you cleaned the sheet on purpose, tell the team to reset the cache.`,
          data: cached.length > 0 ? cached : records
        });
      }
      lastSheetsDataJson = JSON.stringify(records);
    } else {
      records = await loadCache();
      if (records.length === 0) {
        console.log('Cache empty. Fetching from Google Sheets...');
        const rawData = await fetchSheetRawData();
        if (rawData && rawData.length > 0) {
          const headers = rawData[0];
          const rows = rawData.slice(1);
          const seenIds = new Set();
          const normalizedList = [];
          rows.forEach((row, index) => {
            if (!row || row.length === 0) return;
            const item = normalizeRow(row, headers);
            if (!item.id) {
              const cleanPhone = item.contactNumber.replace(/\D/g, '');
              const cleanDate = item.callDate.replace(/[^a-zA-Z0-9]/g, '');
              item.id = `row-${index}-${cleanPhone}-${cleanDate}`;
            }
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              normalizedList.push(item);
            }
          });
          records = normalizedList;
        }
        lastSheetsDataJson = JSON.stringify(records);
        await saveCache(records);
      }
    }
    res.json({ success: true, source: force ? 'google_sheets' : 'cache', data: records });
  } catch (error) {
    console.error('Error in /api/call-analytics:', error);
    const cached = await loadCache();
    if (cached.length > 0) {
      return res.json({
        success: true,
        source: 'cache_fallback',
        error: 'Unable to refresh call data from Google Sheets. Showing the last successfully loaded records.',
        data: cached
      });
    }
    res.status(502).json({
      success: false,
      error: 'Google Sheets is currently unavailable and no cached data is found.'
    });
  }
});

// Start Server
// Trigger server restart for google sheets cache clearing
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`OmniDimension Backend running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/api/stream`);
  console.log(`========================================`);
});



