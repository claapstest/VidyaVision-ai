import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

function isOriginAllowed(origin) {
  if (!origin) return true; // Direct non-browser requests or same-origin
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return true;
  // Permit any local development port on localhost or 127.0.0.1
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// API Authentication Middleware (SEC-01)
const requireAuth = (req, res, next) => {
  const configuredKey = process.env.APP_API_KEY;
  if (!configuredKey) {
    // If no APP_API_KEY is configured in .env, permit requests (development/internal mode)
    return next();
  }
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API key' });
  }
  next();
};
app.use('/api', requireAuth);

const PORT = process.env.PORT || 5000;

function getApiKey() {
  dotenv.config();
  // Secrets live in .env only — never hardcode keys here (this file is committed to git).
  return process.env.OMNIDIM_API_KEY || '';
}

function getAgentId() {
  dotenv.config();
  const id = Number(process.env.AGENT_ID);
  return !isNaN(id) && id > 0 ? id : 270604;
}

function getUgAgentId() {
  dotenv.config();
  const id = Number(process.env.UG_AGENT_ID);
  return !isNaN(id) && id > 0 ? id : 270740;
}

function getPgAgentId() {
  dotenv.config();
  const id = Number(process.env.PG_AGENT_ID || process.env.AGENT_ID);
  return !isNaN(id) && id > 0 ? id : 270604;
}

function isUgCourse(courseName) {
  if (!courseName) return false;
  const c = String(courseName).toLowerCase().trim();
  if (c.includes('b.tech') || c.includes('btech') || c.includes('b.e') || c.includes('be ') || c.startsWith('be-') || c.includes('engineering')) return true;
  if (c.includes('bba') || c.includes('bca') || c.includes('b.sc') || c.includes('bsc')) return true;
  if (c.includes('b.com') || c.includes('bcom') || c.includes('b.a') || c.includes('ba ') || c.includes('b.pharm')) return true;
  if (c.includes('b.arch') || c.includes('b.des') || c.includes('bdes') || c.includes('undergraduate') || c.includes('ug') || c.includes('12th') || c.includes('inter')) return true;
  if (c.startsWith('b.') || c.startsWith('b ') || c.startsWith('bachelor')) return true;
  return false;
}

function resolveAgentIdForCourse(courseName, fallbackAgentId) {
  if (isUgCourse(courseName)) {
    return getUgAgentId();
  }
  const c = String(courseName || '').toLowerCase();
  if (c.includes('mba') || c.includes('m.tech') || c.includes('mtech') || c.includes('mca') || c.includes('m.sc') || c.includes('m.com') || c.includes('pg') || c.includes('master')) {
    return getPgAgentId();
  }
  return fallbackAgentId ? Number(fallbackAgentId) : getAgentId();
}

const DATA_DIR = path.join(process.cwd(), 'data');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const INTERESTS_FILE = path.join(DATA_DIR, 'call_interests.json');
const COLLEGES_FILE = path.join(DATA_DIR, 'colleges.json');
const GOOGLE_SHEETS_CACHE_FILE = path.join(DATA_DIR, 'google_sheets_cache.json');
const CALL_TARGETS_FILE = path.join(DATA_DIR, 'call_targets.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const OMNI_CALLS_CACHE_FILE = path.join(DATA_DIR, 'omni_calls_cache.json');

async function loadCampaigns() {
  try {
    const raw = await fs.readFile(CAMPAIGNS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

async function saveCampaigns(campaigns) {
  try {
    await fs.writeFile(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving campaigns:', err.message);
  }
}

async function loadOmniCache() {
  try {
    const raw = await fs.readFile(OMNI_CALLS_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOmniCache(data) {
  try {
    if (!Array.isArray(data)) return;
    await fs.writeFile(OMNI_CALLS_CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving Omni calls cache:', err.message);
  }
}

function mergeOmniCallLists(existingList, newList) {
  const map = new Map();
  (existingList || []).forEach(c => {
    const idKey = c.id ? `id_${c.id}` : null;
    const phone = String(c.to_number || c.phone_number || c.to || '').replace(/\D/g, '').slice(-10);
    const timeKey = phone && c.time_of_call ? `pt_${phone}_${c.time_of_call}` : null;
    const key = idKey || timeKey || (phone ? `p_${phone}` : null);
    if (key) map.set(key, c);
  });
  (newList || []).forEach(c => {
    const idKey = c.id ? `id_${c.id}` : null;
    const phone = String(c.to_number || c.phone_number || c.to || '').replace(/\D/g, '').slice(-10);
    const timeKey = phone && c.time_of_call ? `pt_${phone}_${c.time_of_call}` : null;
    const key = idKey || timeKey || (phone ? `p_${phone}` : null);
    if (key) {
      const prev = map.get(key) || {};
      map.set(key, { ...prev, ...c });
    }
  });
  const result = Array.from(map.values());
  result.sort((a, b) => {
    const tA = new Date(a.time_of_call || a.call_date || a.timestamp || 0).getTime();
    const tB = new Date(b.time_of_call || b.call_date || b.timestamp || 0).getTime();
    return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
  });
  return result;
}

function enrichCampaignContact(c, omniCalls, sheetsCalls) {
  if (!c || typeof c !== 'object') return c;
  const cleanPhone = String(c.phone || c.formattedPhone || '').replace(/\D/g, '').slice(-10);
  if (!cleanPhone) return c;

  const omniMatch = (omniCalls || []).find(o => {
    const p = String(o.to_number || o.phone_number || o.to || '').replace(/\D/g, '').slice(-10);
    return p === cleanPhone;
  });

  const sheetMatch = (sheetsCalls || []).find(s => {
    const p = String(s.contactNumber || s.rawFields?.to_number || s.to_number || '').replace(/\D/g, '').slice(-10);
    return p === cleanPhone;
  });

  const match = omniMatch || sheetMatch;
  if (!match) return c;

  const rf = match.rawFields || {};
  const ev = match.extracted_variables || {};

  // Resolve Recording URL
  let recUrl = c.recordingUrl || c.recording_url || '';
  if (!recUrl || recUrl === '—' || recUrl === 'false') {
    const raw = match.internal_recording_url || match.recordingUrl || match.recording_url || rf.recording_url || match.recording;
    if (raw && typeof raw === 'string' && raw !== 'false' && raw !== '—') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) recUrl = trimmed;
      else if (trimmed.startsWith('/')) recUrl = `https://backend.omnidim.io${trimmed}`;
      else recUrl = trimmed;
    }
  }

  // Resolve Call Summary
  let summary = c.callSummary || c.summary || '';
  if (!summary || summary === '—' || summary === 'Completed' || summary === 'Not provided') {
    summary = match.sentiment_analysis_details || rf.call_summary || rf.summary || match.call_summary || match.summary || match.interest_details || '';
    if (summary === 'Not provided' || summary === '—') summary = '';
  }

  // Resolve Call Transcript
  let transcript = c.callTranscript || c.call_conversation || c.transcript || '';
  if (!transcript || transcript === '—') {
    if (typeof match.call_conversation === 'string' && match.call_conversation.trim()) {
      transcript = match.call_conversation.replace(/<br\s*\/?>/gi, '\n').trim();
    } else if (Array.isArray(match.call_conversation)) {
      transcript = match.call_conversation.map(t => `${t.user_query ? `User: ${t.user_query}` : ''}${t.user_query && t.bot_response ? '\n' : ''}${t.bot_response ? `Bot: ${t.bot_response}` : ''}`).filter(Boolean).join('\n');
    } else if (Array.isArray(match.interactions) && match.interactions.length > 0) {
      transcript = match.interactions.map(t => `${t.user_query ? `User: ${t.user_query}` : ''}${t.user_query && t.bot_response ? '\n' : ''}${t.bot_response ? `Bot: ${t.bot_response}` : ''}`).filter(Boolean).join('\n');
    } else if (rf.full_conversation || rf.call_conversation) {
      transcript = String(rf.full_conversation || rf.call_conversation).replace(/<br\s*\/?>/gi, '\n').replace(/\s*\|\s*/g, '\n').trim();
    }
  }

  // Duration
  let duration = c.callDuration || '';
  if (!duration || duration === '0:00' || duration === '—') {
    const rawD = match.call_duration || match.duration || (rf && rf.call_duration_in_seconds);
    if (rawD && rawD !== '—' && rawD !== '0:00') {
      duration = formatDuration(rawD);
    }
  }

  // Status & Outcome
  const isAnswered = Boolean(
    (match.call_status || match.status) === 'completed' ||
    (recUrl && recUrl !== '—') ||
    (transcript && transcript !== '—') ||
    (duration && duration !== '0:00' && duration !== '—')
  );

  return {
    ...c,
    status: isAnswered ? 'completed' : (c.status || 'no-answer'),
    callOutcome: isAnswered ? (c.callOutcome && c.callOutcome !== 'no-answer' ? c.callOutcome : 'Completed') : (c.callOutcome || 'No Answer'),
    callDuration: duration || c.callDuration || '0:00',
    recordingUrl: recUrl || c.recordingUrl || '—',
    callSummary: summary || c.callSummary || '—',
    summary: summary || c.summary || '—',
    callTranscript: transcript || c.callTranscript || '—',
    call_conversation: transcript || c.call_conversation || '',
    graduationStatus: match.graduation_status || rf.graduation_status || ev.graduation_status || match.educationStatus || c.graduationStatus || '—',
    admissionTimeline: match.admission_timeline || rf.admission_timeline || ev.admission_timeline || match.timeline || c.admissionTimeline || '—',
    entranceExam: match.entrance_exam || rf.entrance_exam || ev.entrance_exam || match.entranceExam || c.entranceExam || '—',
    counselorRequired: (rf.counsellor_follow_up === 'Yes' || ev.counsellor_follow_up === 'Yes' || match.counselorRequired === 'Yes') ? 'Yes' : (c.counselorRequired || 'No'),
    transferStatus: (rf.call_transfered_status === 'Yes' || ev.call_transfered_status === 'Yes' || match.transferStatus === 'Yes') ? 'Yes' : (c.transferStatus || 'No')
  };
}

const DEFAULT_COLLEGES = [
  {
    id: 'vidyavision',
    name: 'Vidyavision AI Assistant',
    place: 'Hyderabad, Telangana',
    agentId: 270604,
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
    agentId: 270604,
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
    agentId: 270604,
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
    agentId: 270604,
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
    agentId: 270604,
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
    agentId: 270604,
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
  } catch { }
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
  fs.writeFile(CALL_TARGETS_FILE, JSON.stringify(CALL_TARGETS, null, 2), 'utf8').catch(() => { });
}

function rememberCallTargetsBulk(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const now = new Date().toISOString();
  entries.forEach(({ formattedPhone, info }) => {
    const digits = String(formattedPhone || '').replace(/\D/g, '');
    const key = digits.length === 10 ? digits : digits.slice(-10);
    if (!key) return;
    CALL_TARGETS[key] = { ...(CALL_TARGETS[key] || {}), ...info, updatedAt: now };
  });
  fs.writeFile(CALL_TARGETS_FILE, JSON.stringify(CALL_TARGETS, null, 2), 'utf8').catch(() => { });
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
  isScheduled: false,
  scheduledStartTime: null,
  endMode: 'none', // 'none' | 'duration' | 'cutoff' | 'business_window'
  maxDurationMinutes: null,
  timeLimitExpiresAt: null,
  cutoffTimeDisplay: null,
  cutoffTimestamp: null,
  stoppedReason: null,
  startedAt: null,
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
let campaignScheduleTimer = null;
let campaignEndTimer = null;

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

function maskPii(str) {
  if (typeof str !== 'string') return str;
  // Mask 10-digit Indian phone numbers to preserve privacy (TC-SEC-06)
  return str.replace(/(\+?91[\s-]?)?([6-9]\d{4})(\d{5})/g, '$1$2*****');
}

function addLog(type, message) {
  const sanitizedMessage = maskPii(String(message || ''));
  const logEntry = {
    id: String(Date.now()) + '-' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    type, // 'info', 'success', 'error', 'warning'
    message: sanitizedMessage
  };
  LOGS.push(logEntry);
  if (LOGS.length > 150) LOGS.shift(); // Keep logs memory clean
  console.log(`[${type.toUpperCase()}] ${sanitizedMessage}`);
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

  let effectiveStudentName = recoveredName || (studentName && studentName !== 'Student' && studentName !== '—' && studentName !== 'Not provided' ? studentName : '');
  if (!effectiveStudentName && target && target.name) {
    effectiveStudentName = target.name;
  }
  if (!effectiveStudentName) {
    effectiveStudentName = studentName || 'Student';
  }
  if (rawFields && (!rawFields.student_name || rawFields.student_name === 'Not provided' || rawFields.student_name === '—')) {
    rawFields.student_name = effectiveStudentName;
  }

  let effectiveEmail = email;
  if ((!effectiveEmail || effectiveEmail === '—') && target && target.email) {
    effectiveEmail = target.email;
  }
  let effectiveState = preferredState;
  if ((!effectiveState || effectiveState === '—') && target && target.state) {
    effectiveState = target.state;
  }
  let effectiveDistrict = preferredCity;
  if ((!effectiveDistrict || effectiveDistrict === '—') && target && target.district) {
    effectiveDistrict = target.district;
  }
  let effectiveProgram = program;
  if ((!effectiveProgram || effectiveProgram === '—') && target && (target.program || target.course)) {
    effectiveProgram = target.program || target.course;
  }

  return {
    id,
    studentName: effectiveStudentName,
    contactNumber,
    email: effectiveEmail,
    program: effectiveProgram,
    course: course || effectiveProgram,
    preferredState: effectiveState,
    preferredCity: effectiveDistrict,
    extraFields: target?.extraFields || {},
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
    } catch { }
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
}).catch(() => { });
loadInterests().catch(() => { });
loadTargets().catch(() => { });

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
  // WhatsApp dispatch option is currently stopped/disabled.
  // Do not auto-flip contacts to APPLICATION_SENT so data truthfully reflects INTERESTED.
  return null;
}

async function _deprecatedAutoSendWhatsApp(matchedCall, pending) {
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
      } catch { }
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
      } catch { }
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

async function enrichAllCampaigns() {
  try {
    const all = await loadCampaigns();
    if (!all || all.length === 0) return;
    const omni = await loadOmniCache();
    const sheets = await loadCache();
    let updated = false;

    for (const camp of all) {
      if (!Array.isArray(camp.contacts)) continue;
      let answered = 0;
      camp.contacts = camp.contacts.map(c => {
        const enriched = enrichCampaignContact(c, omni, sheets);
        if (enriched.status === 'completed' || (enriched.recordingUrl && enriched.recordingUrl !== '—')) {
          answered++;
        }
        if (
          enriched.recordingUrl !== c.recordingUrl ||
          enriched.callSummary !== c.callSummary ||
          enriched.callTranscript !== c.callTranscript ||
          enriched.status !== c.status ||
          enriched.callDuration !== c.callDuration
        ) {
          updated = true;
        }
        return enriched;
      });
      if (answered > 0) {
        camp.answeredCount = Math.max(camp.answeredCount || 0, answered);
        camp.unansweredCount = Math.max(0, (camp.totalCount || camp.contacts.length) - camp.answeredCount);
      }
    }

    if (updated) {
      await saveCampaigns(all);
      broadcast({ type: 'campaigns', data: all });
    }
  } catch (err) {
    console.error('Error enriching campaigns:', err.message);
  }
}

async function fetchCallsFromOmni(pages = 1) {
  const apiKey = getApiKey();
  const existingCache = await loadOmniCache();
  if (!apiKey) {
    return existingCache.map(c => enrichCallWithInterest(c));
  }

  const newlyFetched = [];
  const maxPages = Math.max(1, Math.min(Number(pages) || 1, 10));

  for (let page = 1; page <= maxPages; page++) {
    const target = `https://backend.omnidim.io/api/v1/calls/logs?pageno=${page}&pagesize=50`;
    try {
      const response = await fetch(target, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`OmniDimension API error on page ${page} (${response.status}): ${errText}`);
        break;
      }
      const data = await response.json();
      const rawCalls = data.call_log_data || data.calls || data.data || data || [];
      if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
        break;
      }

      for (const raw of rawCalls) {
        // Normalize recording_url & internal_recording_url
        let recUrl = raw.internal_recording_url || raw.recording_url || raw.recordingUrl;
        if (recUrl && typeof recUrl === 'string' && recUrl !== 'false' && recUrl !== '—') {
          const trimmed = recUrl.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            raw.recordingUrl = trimmed;
            raw.recording_url = trimmed;
            raw.internal_recording_url = raw.internal_recording_url || trimmed;
          } else if (trimmed.startsWith('/')) {
            raw.recordingUrl = `https://omnidim.io${trimmed}`;
            raw.recording_url = `https://backend.omnidim.io${trimmed}`;
            raw.internal_recording_url = `https://omnidim.io${trimmed}`;
          }
        }

        // Normalize summary
        const summary = raw.sentiment_analysis_details || raw.summary || raw.call_summary || raw.interest_details || '';
        if (summary && summary !== 'Not provided' && summary !== '—') {
          raw.summary = summary;
          raw.call_summary = summary;
          raw.sentiment_analysis_details = raw.sentiment_analysis_details || summary;
        }

        newlyFetched.push(raw);
      }
    } catch (error) {
      console.error(`Error fetching calls from OmniDimension (page ${page}):`, error.message);
      break;
    }
  }

  if (newlyFetched.length > 0) {
    const merged = mergeOmniCallLists(existingCache, newlyFetched);
    await saveOmniCache(merged);
    enrichAllCampaigns().catch(() => { });
    return merged.map(c => enrichCallWithInterest(c));
  }

  return existingCache.map(c => enrichCallWithInterest(c));
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

  // Update active campaign record in campaigns.json
  if (CAMPAIGN_STATE && CAMPAIGN_STATE.campaignId) {
    loadCampaigns().then(async (all) => {
      const camp = all.find(c => c.id === CAMPAIGN_STATE.campaignId);
      if (camp) {
        if (isAnswered) camp.answeredCount = (camp.answeredCount || 0) + 1;
        else camp.unansweredCount = (camp.unansweredCount || 0) + 1;
        camp.completedCount = (camp.completedCount || 0) + 1;
        if (Array.isArray(camp.contacts)) {
          const cMatch = camp.contacts.find(c => (contact.id && c.id === contact.id) || (!contact.id && (c.phone === contact.phone || c.formattedPhone === contact.formattedPhone)));
          if (cMatch) {
            cMatch.status = isAnswered ? 'completed' : 'no-answer';
            cMatch.callOutcome = isAnswered ? 'Completed' : (statusText || 'No Answer');
            cMatch.callDuration = durationStr || '0:00';
          }
        }
        if (camp.completedCount >= camp.totalCount) {
          camp.status = 'completed';
          camp.completedAt = new Date().toISOString();
        }
        await saveCampaigns(all);
        broadcast({ type: 'campaigns', data: all });
      }
    }).catch(() => { });
  }

  if (isAnswered) {
    // Push fresh data immediately so the dashboard shows this call at once:
    // re-check Omni (late transcript/analysis) and re-poll Sheets.
    pollGoogleSheets().catch(() => { });
    setTimeout(() => { pollCallsOnce().catch(() => { }); }, 10000);
    setTimeout(() => { pollCallsOnce().catch(() => { }); }, 30000);
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
            pollGoogleSheets().catch(() => { });
            setTimeout(() => { pollCallsOnce().catch(() => { }); }, 10000);
            setTimeout(() => { pollCallsOnce().catch(() => { }); }, 30000);
          }
          // Auto-send WhatsApp admission link when transcript shows INTERESTED
          maybeAutoSendWhatsApp(matchedCall, pending).catch(() => { });
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
      // Omni posts call logs with a delay (often 30s - 2 min after hang-up for
      // recording/analysis/post-actions). Keep waiting up to 2.5 minutes (150s)
      // so a delayed log is caught, but never freezes the sequential dialer for 8 minutes.
      const waitedSec = Math.floor((Date.now() - pending.dispatchTime) / 1000);
      if (waitedSec > 60 && !pending.waitingLogged) {
        pending.waitingLogged = true;
        addLog('info', `Still waiting for the call log of "${pending.fullName}" (${phone}) — checking Omni updates...`);
      }
      if (Date.now() - pending.dispatchTime > 150000) {
        PENDING_CALLS.delete(phone);
        updateWsPolling();

        const queueContact = CALL_QUEUE.find(q => (pending.queueContactId && q.id === pending.queueContactId) || q.formattedPhone === phone);
        if (queueContact && queueContact.status === 'in-progress') {
          handleQueueContactFinished(queueContact, false, 'timeout', '0:00');
        } else {
          addLog('error', `Call status tracking for "${pending.fullName}" (${phone}) timed out (exceeded 2.5 minutes). Moving to next contact.`);
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

// Scheduled Campaign Auto-Start Processor
function startScheduledCampaign() {
  if (!CAMPAIGN_STATE.isScheduled) return;
  if (campaignScheduleTimer) {
    clearTimeout(campaignScheduleTimer);
    campaignScheduleTimer = null;
  }

  CAMPAIGN_STATE.isScheduled = false;
  CAMPAIGN_STATE.isRunning = true;
  CAMPAIGN_STATE.isPaused = false;
  CAMPAIGN_STATE.startedAt = new Date().toISOString();

  // If duration limit was set, calculate timeLimitExpiresAt from current start
  if (CAMPAIGN_STATE.endMode === 'duration' && CAMPAIGN_STATE.maxDurationMinutes > 0) {
    const expiresAt = new Date(Date.now() + CAMPAIGN_STATE.maxDurationMinutes * 60 * 1000);
    CAMPAIGN_STATE.timeLimitExpiresAt = expiresAt.toISOString();

    const msUntilEnd = Math.max(0, expiresAt.getTime() - Date.now());
    if (msUntilEnd > 0 && msUntilEnd < 2147483647) {
      campaignEndTimer = setTimeout(() => {
        if (CAMPAIGN_STATE.isRunning) {
          processNextInQueue();
        }
      }, msUntilEnd);
    }
  } else if (CAMPAIGN_STATE.endMode === 'cutoff' && CAMPAIGN_STATE.cutoffTimestamp) {
    const msUntilEnd = Math.max(0, new Date(CAMPAIGN_STATE.cutoffTimestamp).getTime() - Date.now());
    if (msUntilEnd > 0 && msUntilEnd < 2147483647) {
      campaignEndTimer = setTimeout(() => {
        if (CAMPAIGN_STATE.isRunning) {
          processNextInQueue();
        }
      }, msUntilEnd);
    }
  }

  const universityDisplay = CAMPAIGN_STATE.universityName || 'Vidyavision AI';
  const activeAgentId = CAMPAIGN_STATE.agentId || getAgentId();
  addLog('success', `⏰ Scheduled start time reached! Campaign "${CAMPAIGN_STATE.campaignName}" is now actively dialing ${CAMPAIGN_STATE.totalCount} contacts for ${universityDisplay} (Agent ID: ${activeAgentId})!`);
  broadcastQueueUpdate();

  processNextInQueue();
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

  // Check if Campaign has reached its End Time / Duration Limit
  if (CAMPAIGN_STATE.endMode && CAMPAIGN_STATE.endMode !== 'none') {
    let limitReached = false;
    let limitReason = '';
    const now = Date.now();

    if (CAMPAIGN_STATE.endMode === 'duration' && CAMPAIGN_STATE.timeLimitExpiresAt) {
      if (now >= new Date(CAMPAIGN_STATE.timeLimitExpiresAt).getTime()) {
        limitReached = true;
        limitReason = `Campaign duration limit of ${CAMPAIGN_STATE.maxDurationMinutes} minutes reached`;
      }
    } else if (CAMPAIGN_STATE.endMode === 'cutoff' && CAMPAIGN_STATE.cutoffTimestamp) {
      if (now >= new Date(CAMPAIGN_STATE.cutoffTimestamp).getTime()) {
        limitReached = true;
        limitReason = `Scheduled cutoff time of ${CAMPAIGN_STATE.cutoffTimeDisplay || 'set cutoff'} reached`;
      }
    } else if (CAMPAIGN_STATE.endMode === 'business_window') {
      const localDate = new Date();
      const currentMinutes = localDate.getHours() * 60 + localDate.getMinutes();
      const startMinutes = 9 * 60 + 30; // 09:30 AM
      const endMinutes = 18 * 60 + 30;  // 06:30 PM
      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
        limitReached = true;
        limitReason = 'Permissible business calling window (09:30 AM – 06:30 PM) ended for today';
      }
    }

    if (limitReached) {
      if (campaignEndTimer) {
        clearTimeout(campaignEndTimer);
        campaignEndTimer = null;
      }
      CAMPAIGN_STATE.isRunning = false;
      CAMPAIGN_STATE.isPaused = false;
      CURRENT_CALL = null;
      CAMPAIGN_STATE.stoppedReason = limitReason;
      const uncalledCount = CALL_QUEUE.filter(c => c.status === 'queued').length;
      addLog('warning', `⏰ ${limitReason}! Campaign auto-stopped. ${CAMPAIGN_STATE.completedCount} calls made, ${uncalledCount} uncalled contacts remaining. You can resume calling uncalled contacts anytime from the Dialer.`);

      if (CAMPAIGN_STATE.campaignId) {
        loadCampaigns().then(async (all) => {
          const camp = all.find(c => c.id === CAMPAIGN_STATE.campaignId);
          if (camp) {
            camp.status = 'stopped_by_timelimit';
            camp.stoppedReason = limitReason;
            await saveCampaigns(all);
            broadcast({ type: 'campaigns', data: all });
          }
        }).catch(() => { });
      }

      broadcastQueueUpdate();
      return;
    }
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
  const targetCourse = contact.course || CAMPAIGN_STATE.course || '';
  const activeAgentId = resolveAgentIdForCourse(targetCourse, CAMPAIGN_STATE.agentId);
  const botLabel = isUgCourse(targetCourse) ? 'UG Bot (#270740)' : 'PG Bot (#270604)';
  const apiKey = getApiKey();
  addLog('info', `Sequential Dialing [${nextIndex + 1}/${CAMPAIGN_STATE.totalCount}] using ${universityDisplay} [${botLabel}]: Initiating call to ${contact.formattedPhone} (Name: ${nameDisplay}, Course: ${targetCourse || 'General'})...`);

  if (!apiKey) {
    addLog('error', 'OMNIDIM_API_KEY is missing! Call dispatch aborted.');
    handleQueueContactFinished(contact, false, 'api_key_missing', '0:00');
    return;
  }

  try {
    const collegeName = CAMPAIGN_STATE.universityName || 'Vidyavision AI';
    let collegePlace = CAMPAIGN_STATE.collegePlace || contact.collegePlace || '';
    if (!collegePlace && (CAMPAIGN_STATE.universityId || contact.universityId)) {
      try {
        const rawColleges = JSON.parse(await fs.readFile(COLLEGES_FILE, 'utf8'));
        const targetId = CAMPAIGN_STATE.universityId || contact.universityId;
        const found = rawColleges.find(c => String(c.id) === String(targetId));
        if (found && (found.place || found.location)) {
          collegePlace = found.place || found.location;
        }
      } catch (_) { }
    }
    const applicationUrl = CAMPAIGN_STATE.applicationUrl || '';
    const targetCourse = contact.course || CAMPAIGN_STATE.course || '';
    const studentName = contact.name || 'Student';
    // Explicit self-introduction line so the agent always says the selected
    // college name and place/city first, even if its dashboard prompt is generic.
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
        place: collegePlace,
        city: collegePlace,
        location: collegePlace,
        college_city: collegePlace,
        college_location: collegePlace,
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
        place: collegePlace,
        city: collegePlace,
        location: collegePlace,
        college_city: collegePlace,
        college_location: collegePlace,
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
  }).catch(() => { });

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
    } catch { }
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
  const origin = req.headers.origin;
  // Protect against Cross-Site WebSocket Hijacking (SEC-02)
  if (origin && !isOriginAllowed(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
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

    // Reject deletion if referenced by an active, paused, or scheduled campaign (TC-CAM-03)
    const allCampaigns = await loadCampaigns();
    const activeCamp = allCampaigns.find(camp =>
      (camp.universityId === id || camp.universityName?.toLowerCase() === target.name?.toLowerCase()) &&
      (camp.status === 'in-progress' || camp.status === 'scheduled' || camp.status === 'paused')
    );
    if (activeCamp && req.query.force !== 'true') {
      return res.status(409).json({
        success: false,
        error: `Cannot delete "${target.name}" because it is currently used by campaign "${activeCamp.name}" (${activeCamp.status}). Please complete or cancel the campaign first.`
      });
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
  try {
    const {
      contacts,
      delaySeconds,
      agentId,
      universityName,
      universityId,
      collegePlace,
      applicationUrl,
      course,
      campaignName,
      startMode = 'immediate',
      scheduledStartTime = null,
      endMode = 'none',
      maxDurationMinutes = null,
      cutoffTime = null
    } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      addLog('error', 'Batch call failed: No contacts provided.');
      return res.status(400).json({ error: 'Please provide at least one contact to start dialing.' });
    }

    // Prevent accidental overwriting of an active dialing queue (TC-API-02)
    if (CAMPAIGN_STATE && CAMPAIGN_STATE.isRunning && !req.body.force && CAMPAIGN_STATE.campaignId !== req.body?.campaignId) {
      return res.status(409).json({
        success: false,
        error: `Campaign "${CAMPAIGN_STATE.campaignName || 'Active Campaign'}" is currently actively dialing. Please pause or cancel the running campaign first before starting a new one.`
      });
    }

    // Validate and parse contacts
    const parsedQueue = [];

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
          reason: '',
          email: c.email ? String(c.email).trim() : '',
          state: c.state ? String(c.state).trim() : '',
          district: c.district ? String(c.district).trim() : '',
          program: (c.program ? String(c.program).trim() : '') || (c.course ? String(c.course).trim() : '') || (course ? String(course).trim() : ''),
          extraFields: (c.extraFields && typeof c.extraFields === 'object') ? c.extraFields : {}
        });
      }
    });

    if (parsedQueue.length === 0) {
      addLog('error', 'Batch call failed: No valid phone numbers found in list.');
      return res.status(400).json({ error: 'No valid mobile numbers found in submission.' });
    }

    const defaultCampaignName = `${universityName || 'University'} - ${course ? course + ' ' : ''}Campaign (${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`;
    const finalCampaignName = campaignName && campaignName.trim() ? campaignName.trim() : defaultCampaignName;
    const newCampaignId = req.body?.campaignId || req.body?.existingCampaignId || `camp-${Date.now()}`;

    // Clear any existing timers
    if (campaignScheduleTimer) {
      clearTimeout(campaignScheduleTimer);
      campaignScheduleTimer = null;
    }
    if (campaignEndTimer) {
      clearTimeout(campaignEndTimer);
      campaignEndTimer = null;
    }
    if (queueNextTimer) {
      clearTimeout(queueNextTimer);
      queueNextTimer = null;
    }

    // Resolve Cutoff Timestamp if specified
    let resolvedCutoffTimestamp = null;
    let resolvedCutoffDisplay = null;
    if (endMode === 'cutoff' && cutoffTime) {
      if (String(cutoffTime).includes('T')) {
        const dt = new Date(cutoffTime);
        if (!isNaN(dt.getTime())) {
          resolvedCutoffTimestamp = dt.toISOString();
          resolvedCutoffDisplay = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
      } else {
        const [h, m] = String(cutoffTime).split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const dt = new Date();
          dt.setHours(h, m, 0, 0);
          if (startMode === 'immediate' && dt.getTime() <= Date.now()) {
            dt.setDate(dt.getDate() + 1);
          }
          resolvedCutoffTimestamp = dt.toISOString();
          resolvedCutoffDisplay = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
      }
    }

    // Reset campaign queue
    CALL_QUEUE = parsedQueue;
    CURRENT_CALL = null;

    // Persist call targets mapping for student history in a single atomic batch
    const bulkTargets = parsedQueue.map(ct => ({
      formattedPhone: ct.formattedPhone,
      info: {
        name: ct.name || '',
        collegeName: universityName || '',
        universityId: universityId || '',
        applicationUrl: applicationUrl || '',
        course: ct.course || course || '',
        email: ct.email || '',
        state: ct.state || '',
        district: ct.district || '',
        program: ct.program || '',
        extraFields: ct.extraFields || {}
      }
    }));
    rememberCallTargetsBulk(bulkTargets);

    // Check if Campaign is Scheduled for Future
    const targetStartTime = scheduledStartTime ? new Date(scheduledStartTime).getTime() : 0;
    const msUntilStart = targetStartTime - Date.now();
    const isScheduledFuture = startMode === 'scheduled' && msUntilStart > 5000;

    if (isScheduledFuture) {
      CAMPAIGN_STATE = {
        isRunning: false,
        isPaused: false,
        isScheduled: true,
        scheduledStartTime: new Date(targetStartTime).toISOString(),
        endMode: endMode || 'none',
        maxDurationMinutes: maxDurationMinutes ? Number(maxDurationMinutes) : null,
        timeLimitExpiresAt: null,
        cutoffTimestamp: resolvedCutoffTimestamp,
        cutoffTimeDisplay: resolvedCutoffDisplay,
        stoppedReason: null,
        startedAt: null,
        campaignId: newCampaignId,
        campaignName: finalCampaignName,
        totalCount: parsedQueue.length,
        completedCount: 0,
        answeredCount: 0,
        unansweredCount: 0,
        delayMs: (Number(delaySeconds) || 2) * 1000,
        currentContactIndex: -1,
        agentId: resolveAgentIdForCourse(course || parsedQueue[0]?.course, agentId),
        universityId: universityId ? String(universityId) : '',
        universityName: universityName ? String(universityName) : 'Vidyavision AI Admission Assistant',
        collegePlace: collegePlace ? String(collegePlace) : '',
        applicationUrl: applicationUrl ? String(applicationUrl) : '',
        course: course ? String(course).trim() : ''
      };

      campaignScheduleTimer = setTimeout(() => {
        startScheduledCampaign();
      }, msUntilStart);

      const scheduledDateStr = new Date(targetStartTime).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      addLog('info', `📅 Campaign "${finalCampaignName}" SCHEDULED to start automatically on ${scheduledDateStr} with ${parsedQueue.length} contacts.`);

      // Persist scheduled campaign record
      const campaignRecord = {
        id: newCampaignId,
        name: finalCampaignName,
        universityId: universityId || '',
        universityName: universityName || 'Vidyavision AI',
        collegePlace: collegePlace || '',
        course: course || '',
        agentId: CAMPAIGN_STATE.agentId,
        startedAt: null,
        scheduledStartTime: CAMPAIGN_STATE.scheduledStartTime,
        totalCount: parsedQueue.length,
        completedCount: 0,
        answeredCount: 0,
        unansweredCount: 0,
        status: 'scheduled',
        contacts: parsedQueue.map(c => ({
          id: c.id,
          name: c.name || '',
          phone: c.phone || '',
          formattedPhone: c.formattedPhone || (c.phone ? `+91${c.phone}` : ''),
          course: c.course || course || '',
          universityName: universityName || '',
          email: c.email || '',
          state: c.state || '',
          district: c.district || '',
          program: c.program || c.course || course || '',
          extraFields: c.extraFields || {},
          status: 'queued',
          callDuration: '—',
          callOutcome: 'Pending',
          timestamp: new Date().toISOString()
        }))
      };

      loadCampaigns().then(async (all) => {
        const existingIdx = all.findIndex(c => c.id === newCampaignId);
        let updated;
        if (existingIdx !== -1) {
          all[existingIdx] = { ...all[existingIdx], ...campaignRecord };
          updated = all;
        } else {
          updated = [campaignRecord, ...all];
        }
        await saveCampaigns(updated);
        broadcast({ type: 'campaigns', data: updated });
      }).catch(() => { });

      broadcastQueueUpdate();

      return res.json({
        success: true,
        isScheduled: true,
        scheduledStartTime: CAMPAIGN_STATE.scheduledStartTime,
        campaignId: newCampaignId,
        campaignName: finalCampaignName,
        message: `Campaign scheduled to start on ${scheduledDateStr}.`,
        totalCount: parsedQueue.length
      });
    }

    // Immediate start with optional duration/cutoff limit
    let timeLimitExpiresAt = null;
    if (endMode === 'duration' && maxDurationMinutes && Number(maxDurationMinutes) > 0) {
      timeLimitExpiresAt = new Date(Date.now() + Number(maxDurationMinutes) * 60 * 1000).toISOString();
    }

    CAMPAIGN_STATE = {
      isRunning: true,
      isPaused: false,
      isScheduled: false,
      scheduledStartTime: null,
      endMode: endMode || 'none',
      maxDurationMinutes: maxDurationMinutes ? Number(maxDurationMinutes) : null,
      timeLimitExpiresAt,
      cutoffTimestamp: resolvedCutoffTimestamp,
      cutoffTimeDisplay: resolvedCutoffDisplay,
      stoppedReason: null,
      startedAt: new Date().toISOString(),
      campaignId: newCampaignId,
      campaignName: finalCampaignName,
      totalCount: parsedQueue.length,
      completedCount: 0,
      answeredCount: 0,
      unansweredCount: 0,
      delayMs: (Number(delaySeconds) || 2) * 1000,
      currentContactIndex: -1,
      agentId: resolveAgentIdForCourse(course || parsedQueue[0]?.course, agentId),
      universityId: universityId ? String(universityId) : '',
      universityName: universityName ? String(universityName) : 'Vidyavision AI Admission Assistant',
      collegePlace: collegePlace ? String(collegePlace) : '',
      applicationUrl: applicationUrl ? String(applicationUrl) : '',
      course: course ? String(course).trim() : ''
    };

    // Set timeout watcher if duration or cutoff limit exists
    const targetEnd = timeLimitExpiresAt ? new Date(timeLimitExpiresAt).getTime() : (resolvedCutoffTimestamp ? new Date(resolvedCutoffTimestamp).getTime() : null);
    if (targetEnd) {
      const msUntilEnd = Math.max(0, targetEnd - Date.now());
      if (msUntilEnd > 0 && msUntilEnd < 2147483647) {
        campaignEndTimer = setTimeout(() => {
          if (CAMPAIGN_STATE.isRunning) {
            processNextInQueue();
          }
        }, msUntilEnd);
      }
    }

    const initialBotLabel = isUgCourse(CAMPAIGN_STATE.course || parsedQueue[0]?.course) ? 'UG Bot (#270740)' : 'PG Bot (#270604)';
    addLog('info', `Campaign "${finalCampaignName}" initialized with ${initialBotLabel} for course "${CAMPAIGN_STATE.course || 'General'}".`);

    // Persist new campaign into campaigns.json
    const campaignRecord = {
      id: newCampaignId,
      name: finalCampaignName,
      universityId: universityId || '',
      universityName: universityName || 'Vidyavision AI',
      collegePlace: collegePlace || '',
      course: course || '',
      agentId: CAMPAIGN_STATE.agentId,
      startedAt: new Date().toISOString(),
      totalCount: parsedQueue.length,
      completedCount: 0,
      answeredCount: 0,
      unansweredCount: 0,
      status: 'in-progress',
      contacts: parsedQueue.map(c => ({
        id: c.id,
        name: c.name || '',
        phone: c.phone || '',
        formattedPhone: c.formattedPhone || (c.phone ? `+91${c.phone}` : ''),
        course: c.course || course || '',
        universityName: universityName || '',
        email: c.email || '',
        state: c.state || '',
        district: c.district || '',
        program: c.program || c.course || course || '',
        extraFields: c.extraFields || {},
        status: 'queued',
        callDuration: '—',
        callOutcome: 'Pending',
        timestamp: new Date().toISOString()
      }))
    };

    loadCampaigns().then(async (all) => {
      const existingIdx = all.findIndex(c => c.id === newCampaignId);
      let updated;
      if (existingIdx !== -1) {
        all[existingIdx] = { ...all[existingIdx], ...campaignRecord };
        updated = all;
      } else {
        updated = [campaignRecord, ...all];
      }
      await saveCampaigns(updated);
      broadcast({ type: 'campaigns', data: updated });
    }).catch(() => { });

    const universityDisplay = CAMPAIGN_STATE.universityName;
    const activeAgentId = CAMPAIGN_STATE.agentId || getAgentId();
    addLog('success', `Campaign "${finalCampaignName}" initialized for ${universityDisplay} (Agent ID: ${activeAgentId}) with ${parsedQueue.length} contacts! Starting sequential calling...`);
    broadcastQueueUpdate();

    // Kick off sequential execution
    processNextInQueue();

    res.json({
      success: true,
      campaignId: newCampaignId,
      campaignName: finalCampaignName,
      message: `Started sequential calling campaign "${finalCampaignName}" with ${parsedQueue.length} contacts.`,
      totalCount: parsedQueue.length
    });
  } catch (err) {
    console.error('Error starting campaign:', err);
    addLog('error', `Failed to start campaign: ${err.message}`);
    res.status(500).json({ success: false, error: err.message || 'Server error starting campaign' });
  }
});


// Campaign Management Endpoints
app.get('/api/campaigns', async (req, res) => {
  try {
    const { universityId } = req.query;
    const all = await loadCampaigns();
    if (universityId && universityId !== 'ALL') {
      return res.json({ success: true, data: all.filter(c => c.universityId === universityId) });
    }
    res.json({ success: true, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const all = await loadCampaigns();
    const camp = all.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: camp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/campaigns/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const all = await loadCampaigns();
    const camp = all.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (name && name.trim()) camp.name = name.trim();
    await saveCampaigns(all);
    broadcast({ type: 'campaigns', data: all });
    res.json({ success: true, data: camp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const all = await loadCampaigns();
    const updated = all.filter(c => c.id !== req.params.id);
    await saveCampaigns(updated);
    broadcast({ type: 'campaigns', data: updated });
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/campaigns/:id/export', async (req, res) => {
  try {
    const all = await loadCampaigns();
    const camp = all.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ success: false, error: 'Campaign not found' });

    let campaignContacts = camp.contacts || [];
    if (req.query.completedOnly === 'true') {
      campaignContacts = campaignContacts.filter(c => c.status === 'completed' || (c.callOutcome && String(c.callOutcome).toLowerCase() === 'completed'));
    }

    const cachedSheets = await loadCache();
    const cachedOmni = await loadOmniCache();
    const phoneMap = new Map();
    (cachedSheets || []).forEach(s => {
      const p = String(s.contactNumber || s.rawFields?.to_number || s.to_number || s.phone_number || '').replace(/\D/g, '').slice(-10);
      if (p && !phoneMap.has(p)) phoneMap.set(p, s);
    });
    (cachedOmni || []).forEach(o => {
      const p = String(o.to_number || o.phone_number || o.to || '').replace(/\D/g, '').slice(-10);
      if (p) {
        const prev = phoneMap.get(p) || {};
        phoneMap.set(p, { ...prev, ...o });
      }
    });

    // Helper to test if a key represents one of the standard columns
    const isStandardKey = (key) => {
      const norm = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return ['name', 'fullname', 'studentname', 'student', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber', 'email', 'emailid', 'mail', 'mailid', 'state', 'preferredstate', 'stateut', 'district', 'preferredcity', 'city', 'town', 'program', 'course', 'degree', 'branch', 'university', 'college', 'collegename', 'targetcollege', 'preferreduniversity'].includes(norm);
    };

    // Helper to find best matching value for a field from multiple object sources
    const resolveField = (sources, patterns) => {
      for (const src of sources) {
        if (!src || typeof src !== 'object') continue;
        for (const pat of patterns) {
          if (src[pat] !== undefined && src[pat] !== null) {
            const val = String(src[pat]).trim();
            if (val && val !== '—' && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'undefined') return val;
          }
        }
        const srcKeys = Object.keys(src);
        for (const pat of patterns) {
          const cleanPat = pat.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const k of srcKeys) {
            if (k === 'extraFields' || k === 'rawFields') continue;
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanK === cleanPat || (cleanPat.length >= 4 && cleanK.includes(cleanPat))) {
              const val = String(src[k]).trim();
              if (val && val !== '—' && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'undefined') return val;
            }
          }
        }
      }
      return '—';
    };

    // Discover dynamic extra columns from uploaded Excel sheets (casing and punctuation normalized)
    const extraFieldKeys = [];
    const normKeyMap = new Map();
    campaignContacts.forEach(c => {
      if (c.extraFields && typeof c.extraFields === 'object') {
        Object.keys(c.extraFields).forEach(k => {
          if (!isStandardKey(k)) {
            const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (norm && !normKeyMap.has(norm)) {
              normKeyMap.set(norm, k);
              extraFieldKeys.push(k);
            }
          }
        });
      }
    });

    const getExtraFieldValue = (obj, key) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') return String(obj[key]).trim();
      const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [k, v] of Object.entries(obj)) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === norm && v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
      return null;
    };

    const csvHeaders = [
      'S.No', 'Full Name', 'Phone Number', 'Email ID', 'State', 'District',
      ...extraFieldKeys,
      'Program', 'University',
      'Lead Status', 'Graduation Status', 'Admission Timeline', 'Entrance Exam', 'Counsellor Follow-up',
      'Live Transferred', 'Call Duration', 'Call Date & Time', 'Call Summary', 'Call Recording URL', 'Call Transcript / Full Conversation'
    ];

    const escapeCsv = (val) => {
      if (val === undefined || val === null) return '""';
      let str = String(val);
      // Neutralize CSV formula injection & preserve phone prefixes (SEC-03, TC-EXP-02, TC-EXP-03)
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = campaignContacts.map((c, i) => {
      const cleanPhone = String(c.formattedPhone || c.phone || '').replace(/\D/g, '').slice(-10);
      const match = cleanPhone ? phoneMap.get(cleanPhone) : null;
      const rf = match?.rawFields || {};
      const ev = match?.extracted_variables || {};

      const st = String(c.status || match?.status || match?.call_status || '').toLowerCase();
      const outcome = String(c.callOutcome || match?.callOutcome || match?.leadStatus || '').toLowerCase();
      let statusLabel = '❌ Not Answered';
      if (st === 'queued') statusLabel = '⏳ Queued';
      else if (outcome.includes('interest')) statusLabel = '🟢 Interested';
      else if (outcome.includes('app') || outcome.includes('sent')) statusLabel = '📩 Application Sent';
      else if (outcome.includes('callback')) statusLabel = '📞 Callback';
      else if (outcome.includes('joined')) statusLabel = '🎓 Already Joined';
      else if (outcome.includes('not') || outcome.includes('decline')) statusLabel = '🔴 Not Interested';
      else if (outcome.includes('wrong') || outcome.includes('invalid')) statusLabel = '⚠️ Wrong / Invalid';
      else if (st === 'completed' || st === 'answered') statusLabel = '📞 Answered';

      const studentName = c.name && c.name !== 'Student' ? c.name : (match?.studentName || match?.name || c.name || 'Student');
      const phone = c.formattedPhone || (cleanPhone ? `+91${cleanPhone}` : '') || match?.contactNumber || '—';
      const email = resolveField([c, c.extraFields, match, match?.extraFields, rf], ['email', 'email id', 'emailid', 'email address', 'mail', 'mail id', 'student email']);
      const state = resolveField([c, c.extraFields, match, match?.extraFields, rf], ['state', 'preferred state', 'preferredstate', 'state ut', 'region', 'province']);
      const district = resolveField([c, c.extraFields, match, match?.extraFields, rf], ['district', 'preferred city', 'preferredcity', 'city', 'town', 'location']);
      const program = resolveField([c, c.extraFields, match, match?.extraFields, rf], ['program', 'course', 'degree', 'branch', 'specialization', 'target_course']);
      const university = resolveField([c, c.extraFields, match, match?.extraFields, rf], ['university', 'university name', 'college', 'college name', 'target_college', 'preferred university']);

      const gradStatus = c.graduationStatus || match?.graduation_status || rf.graduation_status || ev.graduation_status || match?.educationStatus || '—';
      const admTimeline = c.admissionTimeline || match?.admission_timeline || rf.admission_timeline || ev.admission_timeline || match?.timeline || '—';
      const entExam = c.entranceExam || match?.entrance_exam || rf.entrance_exam || ev.entrance_exam || match?.entranceExam || '—';
      const counselorFollowup = (c.counselorRequired === 'Yes' || rf.counsellor_follow_up === 'Yes' || ev.counsellor_follow_up === 'Yes' || match?.counselorRequired === 'Yes') ? 'Yes' : 'No';
      const liveTransferred = (c.transferStatus === 'Yes' || rf.call_transfered_status === 'Yes' || ev.call_transfered_status === 'Yes' || match?.transferStatus === 'Yes') ? 'Yes' : 'No';
      const duration = (match?.callDuration && match.callDuration !== '—') ? match.callDuration : (c.callDuration || '—');
      const callDateTime = match?.callDate || match?.time_of_call || rf.call_date || c.timestamp || camp.startedAt || '—';

      // Summary
      let summary = c.callSummary || c.summary || '';
      if (!summary || summary === '—' || summary === 'Completed' || summary === 'Not provided') {
        summary = match?.sentiment_analysis_details || rf.call_summary || rf.summary || match?.call_summary || match?.summary || match?.interest_details || '—';
        if (summary === 'Not provided') summary = '—';
      }

      // Recording URL
      let recUrl = c.recordingUrl || c.recording_url || '';
      if (!recUrl || recUrl === '—' || recUrl === 'false') {
        const raw = match?.internal_recording_url || match?.recordingUrl || match?.recording_url || rf.recording_url || match?.recording;
        if (raw && typeof raw === 'string' && raw !== 'false' && raw !== '—') {
          const trimmed = raw.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) recUrl = trimmed;
          else if (trimmed.startsWith('/')) recUrl = `https://backend.omnidim.io${trimmed}`;
          else recUrl = trimmed;
        } else {
          recUrl = '—';
        }
      }

      // Transcript
      let transcript = c.callTranscript || c.call_conversation || c.transcript || '';
      if (!transcript || transcript === '—') {
        if (typeof match?.call_conversation === 'string' && match.call_conversation.trim()) {
          transcript = match.call_conversation.replace(/<br\s*\/?>/gi, '\n').trim();
        } else if (Array.isArray(match?.call_conversation)) {
          transcript = match.call_conversation.map(t => `${t.user_query ? `User: ${t.user_query}` : ''}${t.user_query && t.bot_response ? '\n' : ''}${t.bot_response ? `Bot: ${t.bot_response}` : ''}`).filter(Boolean).join('\n');
        } else if (Array.isArray(match?.interactions) && match.interactions.length > 0) {
          transcript = match.interactions.map(t => `${t.user_query ? `User: ${t.user_query}` : ''}${t.user_query && t.bot_response ? '\n' : ''}${t.bot_response ? `Bot: ${t.bot_response}` : ''}`).filter(Boolean).join('\n');
        } else if (rf.full_conversation || rf.call_conversation) {
          transcript = String(rf.full_conversation || rf.call_conversation).replace(/<br\s*\/?>/gi, '\n').replace(/\s*\|\s*/g, '\n').trim();
        } else {
          transcript = '—';
        }
      }

      const extraVals = extraFieldKeys.map(k => {
        const val = getExtraFieldValue(c.extraFields, k) || getExtraFieldValue(match?.extraFields, k) || getExtraFieldValue(rf, k) || '—';
        return escapeCsv(val);
      });

      return [
        i + 1,
        escapeCsv(studentName),
        escapeCsv(phone),
        escapeCsv(email),
        escapeCsv(state),
        escapeCsv(district),
        ...extraVals,
        escapeCsv(program !== '—' ? program : (camp.course || 'MBA')),
        escapeCsv(university !== '—' ? university : (camp.universityName || 'MIT WPU')),
        escapeCsv(statusLabel),
        escapeCsv(gradStatus),
        escapeCsv(admTimeline),
        escapeCsv(entExam),
        escapeCsv(counselorFollowup),
        escapeCsv(liveTransferred),
        escapeCsv(duration),
        escapeCsv(callDateTime),
        escapeCsv(summary),
        escapeCsv(recUrl),
        escapeCsv(transcript)
      ];
    });

    const csvContent = '\uFEFF' + [csvHeaders.join(','), ...rows.map(r => r.join(','))].join('\n');
    const safeName = (camp.name || 'campaign').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Pause Sequential Queue (Temporary In-Place Pause)
app.post('/api/queue/pause', (req, res) => {
  if (!CAMPAIGN_STATE.isRunning) {
    return res.status(400).json({ error: 'No campaign is currently running.' });
  }

  CAMPAIGN_STATE.isPaused = true;
  if (queueNextTimer) {
    clearTimeout(queueNextTimer);
    queueNextTimer = null;
  }

  if (CAMPAIGN_STATE.campaignId) {
    loadCampaigns().then(async (all) => {
      const camp = all.find(c => c.id === CAMPAIGN_STATE.campaignId);
      if (camp) {
        camp.status = 'paused';
        await saveCampaigns(all);
        broadcast({ type: 'campaigns', data: all });
      }
    }).catch(() => { });
  }

  addLog('warning', 'Sequential calling campaign PAUSED.');
  broadcastQueueUpdate();
  res.json({ success: true, message: 'Campaign paused.' });
});

// 2b. Split Campaign: Part 1 (Completed) & Part 2 (Paused Remaining)
app.post('/api/queue/split', async (req, res) => {
  try {
    if (queueNextTimer) {
      clearTimeout(queueNextTimer);
      queueNextTimer = null;
    }
    if (campaignScheduleTimer) {
      clearTimeout(campaignScheduleTimer);
      campaignScheduleTimer = null;
    }
    if (campaignEndTimer) {
      clearTimeout(campaignEndTimer);
      campaignEndTimer = null;
    }

    const allCampaigns = await loadCampaigns();
    const activeCampId = req.body?.campaignId || CAMPAIGN_STATE.campaignId;
    let camp = null;
    if (activeCampId) {
      camp = allCampaigns.find(c => c.id === activeCampId);
    }
    if (!camp && CAMPAIGN_STATE.campaignName) {
      camp = allCampaigns.find(c => c.name === CAMPAIGN_STATE.campaignName);
    }
    if (!camp && allCampaigns.length > 0) {
      camp = allCampaigns[0];
    }

    if (!camp) {
      return res.status(404).json({ success: false, error: 'No campaign record found to split.' });
    }

    // Sync any recent in-memory queue statuses into camp.contacts
    if (Array.isArray(camp.contacts) && Array.isArray(CALL_QUEUE)) {
      camp.contacts.forEach(c => {
        const q = CALL_QUEUE.find(item => item.id === c.id || item.formattedPhone === c.formattedPhone || item.phone === c.phone);
        if (q && q.status && q.status !== 'queued') {
          c.status = q.status;
          if (q.duration) c.callDuration = q.duration;
          if (q.reason) c.callOutcome = q.reason;
        }
      });
    }

    const contactsList = Array.isArray(camp.contacts) ? camp.contacts : [];

    // Separate completed contacts vs uncalled contacts
    const completedContacts = contactsList.filter(c =>
      c.status === 'completed' || c.status === 'no-answer' || c.status === 'answered' || c.status === 'failed' || c.status === 'busy'
    );
    const uncalledContacts = contactsList.filter(c => !completedContacts.includes(c));

    if (completedContacts.length === 0) {
      return res.status(400).json({ success: false, error: 'No contacts have been dialed yet to split into Part 1. You can pause temporarily instead.' });
    }

    if (uncalledContacts.length === 0) {
      return res.status(400).json({ success: false, error: 'All contacts in this campaign have already been dialed. No remaining contacts to split into Part 2.' });
    }

    // Smart naming without redundant nesting (e.g., "Batch - Part 1" -> Part 1 & Part 2)
    const rawName = (camp.name || 'Campaign').trim();
    const partMatch = rawName.match(/^(.*?)(?:\s*-\s*Part\s*(\d+))?$/i);
    const baseName = partMatch && partMatch[1] ? partMatch[1].trim() : rawName;
    const currentPartNum = partMatch && partMatch[2] ? parseInt(partMatch[2], 10) : 1;

    const part1Name = partMatch && partMatch[2] ? rawName : `${baseName} - Part ${currentPartNum}`;
    const part2Name = `${baseName} - Part ${currentPartNum + 1}`;

    // Clean uncalled contacts for Part 2 so they are ready to call
    const remainingContacts = uncalledContacts.map((c, i) => ({
      ...c,
      id: c.id || `contact-${Date.now()}-${i}`,
      status: 'queued',
      callOutcome: 'Pending',
      callDuration: '—',
      timestamp: new Date().toISOString()
    }));

    // Update Part 1 (Completed)
    const p1Answered = completedContacts.filter(c => c.status === 'completed' || c.status === 'answered' || (c.callOutcome && c.callOutcome.toLowerCase().includes('answer'))).length;
    const p1Unanswered = completedContacts.length - p1Answered;

    camp.name = part1Name;
    camp.contacts = completedContacts;
    camp.totalCount = completedContacts.length;
    camp.completedCount = completedContacts.length;
    camp.answeredCount = p1Answered;
    camp.unansweredCount = p1Unanswered;
    camp.status = 'completed';
    camp.completedAt = new Date().toISOString();

    // Create Part 2 (Paused)
    const part2Id = `camp-${Date.now()}`;
    const part2Campaign = {
      id: part2Id,
      name: part2Name,
      universityId: camp.universityId || '',
      universityName: camp.universityName || 'Vidyavision AI',
      collegePlace: camp.collegePlace || '',
      course: camp.course || '',
      agentId: camp.agentId || CAMPAIGN_STATE.agentId || 270740,
      startedAt: new Date().toISOString(),
      totalCount: remainingContacts.length,
      completedCount: 0,
      answeredCount: 0,
      unansweredCount: 0,
      status: 'paused',
      contacts: remainingContacts
    };

    // Place Part 2 right above Part 1 in list
    const campIdx = allCampaigns.findIndex(c => c.id === camp.id);
    if (campIdx !== -1) {
      allCampaigns.splice(campIdx, 0, part2Campaign);
    } else {
      allCampaigns.unshift(part2Campaign);
    }

    await saveCampaigns(allCampaigns);

    // Reset in-memory active queue state
    CAMPAIGN_STATE.isRunning = false;
    CAMPAIGN_STATE.isPaused = false;
    CAMPAIGN_STATE.isScheduled = false;
    CAMPAIGN_STATE.campaignId = null;
    CAMPAIGN_STATE.campaignName = '';
    CAMPAIGN_STATE.totalCount = 0;
    CAMPAIGN_STATE.completedCount = 0;
    CAMPAIGN_STATE.answeredCount = 0;
    CAMPAIGN_STATE.unansweredCount = 0;
    CALL_QUEUE = [];
    CURRENT_CALL = null;

    addLog('success', `Campaign split into "${part1Name}" (Completed, ${completedContacts.length} calls) & "${part2Name}" (Paused, ${remainingContacts.length} remaining contacts).`);

    broadcast({ type: 'campaigns', data: allCampaigns });
    broadcastQueueUpdate();

    res.json({
      success: true,
      part1: { id: camp.id, name: part1Name, completedCount: completedContacts.length },
      part2: { id: part2Campaign.id, name: part2Name, remainingCount: remainingContacts.length },
      message: `Successfully split campaign into "${part1Name}" and "${part2Name}".`
    });
  } catch (err) {
    console.error('Error splitting campaign:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Resume Sequential Queue (supports in-memory resume and post-restart recovery)
app.post('/api/queue/resume', async (req, res) => {
  const reqCampId = req.body?.campaignId || CAMPAIGN_STATE?.campaignId;

  // Case 1: Campaign is already loaded in memory and paused
  if (CAMPAIGN_STATE && CAMPAIGN_STATE.isRunning && CAMPAIGN_STATE.isPaused) {
    CAMPAIGN_STATE.isPaused = false;
    if (CAMPAIGN_STATE.campaignId) {
      try {
        const all = await loadCampaigns();
        const camp = all.find(c => c.id === CAMPAIGN_STATE.campaignId);
        if (camp) {
          camp.status = 'in-progress';
          await saveCampaigns(all);
          broadcast({ type: 'campaigns', data: all });
        }
      } catch (e) { }
    }
    addLog('info', 'Sequential calling campaign RESUMED.');
    broadcastQueueUpdate();
    if (!CURRENT_CALL) {
      processNextInQueue();
    }
    return res.json({ success: true, message: 'Campaign resumed.' });
  }

  // Case 2: Server restarted or no active in-memory queue, but a paused campaign exists
  try {
    const all = await loadCampaigns();
    const campToResume = reqCampId
      ? all.find(c => c.id === reqCampId)
      : all.find(c => c.status === 'paused');

    if (!campToResume) {
      return res.status(400).json({ error: 'No paused campaign found to resume.' });
    }

    // Filter uncalled contacts
    const uncalledContacts = (campToResume.contacts || []).filter(c => c.status === 'queued' || !c.status);
    if (uncalledContacts.length === 0) {
      campToResume.status = 'completed';
      await saveCampaigns(all);
      broadcast({ type: 'campaigns', data: all });
      return res.status(400).json({ error: 'All contacts in this campaign have already been completed.' });
    }

    // Re-hydrate queue and state
    CALL_QUEUE = uncalledContacts.map(c => ({
      ...c,
      status: 'queued',
      duration: '—',
      reason: ''
    }));
    CURRENT_CALL = null;

    CAMPAIGN_STATE = {
      isRunning: true,
      isPaused: false,
      isScheduled: false,
      scheduledStartTime: null,
      campaignId: campToResume.id,
      campaignName: campToResume.name,
      totalCount: campToResume.totalCount || campToResume.contacts.length,
      completedCount: campToResume.completedCount || 0,
      answeredCount: campToResume.answeredCount || 0,
      unansweredCount: campToResume.unansweredCount || 0,
      delayMs: (Number(campToResume.delaySeconds) || 2) * 1000,
      currentContactIndex: -1,
      agentId: campToResume.agentId || getAgentId(),
      universityId: campToResume.universityId || '',
      universityName: campToResume.universityName || 'Vidyavision AI',
      collegePlace: campToResume.collegePlace || '',
      course: campToResume.course || ''
    };

    campToResume.status = 'in-progress';
    delete campToResume.stoppedReason;
    await saveCampaigns(all);

    addLog('success', `Campaign "${campToResume.name}" RESUMED from paused state (${uncalledContacts.length} uncalled contacts remaining).`);
    broadcastQueueUpdate();
    broadcast({ type: 'campaigns', data: all });

    processNextInQueue();
    return res.json({ success: true, message: `Resumed campaign "${campToResume.name}".`, remainingCount: uncalledContacts.length });
  } catch (err) {
    console.error('Error resuming paused campaign:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. Cancel/Stop Sequential Queue
app.post('/api/queue/cancel', async (req, res) => {
  if (queueNextTimer) {
    clearTimeout(queueNextTimer);
    queueNextTimer = null;
  }
  if (campaignScheduleTimer) {
    clearTimeout(campaignScheduleTimer);
    campaignScheduleTimer = null;
  }
  if (campaignEndTimer) {
    clearTimeout(campaignEndTimer);
    campaignEndTimer = null;
  }

  const activeCampId = CAMPAIGN_STATE.campaignId;

  CAMPAIGN_STATE.isRunning = false;
  CAMPAIGN_STATE.isPaused = false;
  CAMPAIGN_STATE.isScheduled = false;

  CALL_QUEUE.forEach(c => {
    if (c.status === 'queued' || c.status === 'in-progress') {
      c.status = 'canceled';
      c.reason = 'User stopped campaign';
    }
  });

  CURRENT_CALL = null;
  addLog('warning', 'Sequential calling campaign CANCELLED by user.');
  broadcastQueueUpdate();

  // Persist cancellation to campaigns.json (Defect BUG-04)
  if (activeCampId) {
    try {
      const all = await loadCampaigns();
      const camp = all.find(c => c.id === activeCampId);
      if (camp) {
        camp.status = 'canceled';
        camp.canceledAt = new Date().toISOString();
        if (Array.isArray(camp.contacts)) {
          camp.contacts.forEach(c => {
            if (c.status === 'queued' || c.status === 'in-progress') {
              c.status = 'canceled';
              c.callOutcome = 'User stopped campaign';
            }
          });
        }
        await saveCampaigns(all);
        broadcast({ type: 'campaigns', data: all });
      }
    } catch (err) {
      console.error('Error persisting campaign cancellation:', err);
    }
  }

  res.json({ success: true, message: 'Campaign cancelled.' });
});

// 4b. Schedule Controls: Cancel Scheduled Campaign
app.post('/api/queue/schedule/cancel', async (req, res) => {
  if (campaignScheduleTimer) {
    clearTimeout(campaignScheduleTimer);
    campaignScheduleTimer = null;
  }
  const scheduledCampId = CAMPAIGN_STATE.campaignId;

  CAMPAIGN_STATE.isScheduled = false;
  CAMPAIGN_STATE.isRunning = false;
  CAMPAIGN_STATE.scheduledStartTime = null;

  CALL_QUEUE = [];
  CURRENT_CALL = null;

  addLog('warning', 'Scheduled campaign has been cancelled.');
  broadcastQueueUpdate();

  // Persist scheduled cancellation to campaigns.json
  if (scheduledCampId) {
    try {
      const all = await loadCampaigns();
      const camp = all.find(c => c.id === scheduledCampId);
      if (camp) {
        camp.status = 'canceled';
        camp.canceledAt = new Date().toISOString();
        await saveCampaigns(all);
        broadcast({ type: 'campaigns', data: all });
      }
    } catch (err) {
      console.error('Error persisting scheduled campaign cancellation:', err);
    }
  }

  res.json({ success: true, message: 'Scheduled campaign cancelled.' });
});

// 4c. Schedule Controls: Start Now (Force start a scheduled campaign immediately)
app.post('/api/queue/schedule/start-now', (req, res) => {
  if (!CAMPAIGN_STATE.isScheduled) {
    return res.status(400).json({ error: 'No scheduled campaign waiting to start.' });
  }
  startScheduledCampaign();
  res.json({ success: true, message: 'Scheduled campaign started now.' });
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
  try {
    const pages = req.query.pages ? parseInt(req.query.pages, 10) : 1;
    const calls = await fetchCallsFromOmni(pages);
    if (calls && calls.length > 0) {
      return res.json({ success: true, data: calls });
    }
    const cached = await loadOmniCache();
    res.json({ success: true, data: cached.map(c => enrichCallWithInterest(c)) });
  } catch (err) {
    const cached = await loadOmniCache();
    if (cached && cached.length > 0) {
      return res.json({ success: true, data: cached.map(c => enrichCallWithInterest(c)) });
    }
    res.status(502).json({ error: 'Could not fetch calls from OmniDimension: ' + err.message });
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
        console.warn(`Sheets cache guard: kept existing cache (${cached.length} records). Fresh fetch had ${records.length} rows.`);
        return res.json({
          success: true,
          source: 'cache_kept',
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

// Recover running / scheduled campaign state on server boot (Defect BUG-05)
async function recoverServerState() {
  try {
    const all = await loadCampaigns();
    if (!Array.isArray(all) || all.length === 0) return;

    let hasChanges = false;
    const now = Date.now();

    // 1. Recover in-progress campaigns interrupted by server restart
    const interrupted = all.filter(c => c.status === 'in-progress');
    for (const camp of interrupted) {
      camp.status = 'paused';
      camp.stoppedReason = 'Server restarted. Click Resume to continue uncalled contacts.';
      camp.pausedAt = new Date().toISOString();
      hasChanges = true;
      const uncalledCount = Array.isArray(camp.contacts)
        ? camp.contacts.filter(ct => ct.status === 'queued').length
        : 0;
      addLog('warning', `[RECOVERY] Recovered interrupted campaign "${camp.name}". Marked as paused (${uncalledCount} uncalled contacts remaining).`);
    }

    // 2. Recover scheduled campaigns
    const scheduled = all.filter(c => c.status === 'scheduled');

    // Check for missed schedules that passed while offline
    const missed = scheduled.filter(c => new Date(c.scheduledStartTime).getTime() <= now);
    for (const camp of missed) {
      camp.status = 'paused';
      camp.stoppedReason = 'Scheduled start time passed while server was offline. Click Resume to start.';
      hasChanges = true;
      addLog('warning', `[RECOVERY] Scheduled time for "${camp.name}" passed while server was offline. Marked as paused.`);
    }

    // Find the next upcoming scheduled campaign in the future
    const upcoming = scheduled
      .filter(c => new Date(c.scheduledStartTime).getTime() > now)
      .sort((a, b) => new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime())[0];

    if (upcoming && !campaignScheduleTimer) {
      const targetTime = new Date(upcoming.scheduledStartTime).getTime();
      const msUntilStart = targetTime - now;

      // Re-hydrate queue and in-memory campaign state
      const queuedContacts = Array.isArray(upcoming.contacts)
        ? upcoming.contacts.map(ct => ({
          ...ct,
          status: ct.status || 'queued',
          duration: ct.duration || '—',
          reason: ct.callOutcome || ''
        }))
        : [];

      CALL_QUEUE = queuedContacts;

      CAMPAIGN_STATE = {
        isRunning: false,
        isPaused: false,
        isScheduled: true,
        scheduledStartTime: upcoming.scheduledStartTime,
        campaignId: upcoming.id,
        campaignName: upcoming.name,
        totalCount: upcoming.totalCount || queuedContacts.length,
        completedCount: upcoming.completedCount || 0,
        answeredCount: upcoming.answeredCount || 0,
        unansweredCount: upcoming.unansweredCount || 0,
        delayMs: (Number(upcoming.delaySeconds) || 2) * 1000,
        agentId: upcoming.agentId || getAgentId(),
        universityId: upcoming.universityId || '',
        universityName: upcoming.universityName || 'Vidyavision AI',
        collegePlace: upcoming.collegePlace || '',
        course: upcoming.course || ''
      };

      campaignScheduleTimer = setTimeout(() => {
        startScheduledCampaign();
      }, msUntilStart);

      const sDate = new Date(targetTime).toLocaleString('en-IN');
      addLog('info', `[RECOVERY] Re-scheduled campaign "${upcoming.name}" to auto-start on ${sDate} with ${queuedContacts.length} contacts.`);
      broadcastQueueUpdate();
    }

    if (hasChanges) {
      await saveCampaigns(all);
      broadcast({ type: 'campaigns', data: all });
    }
  } catch (err) {
    console.error('Error during server restart recovery:', err);
  }
}

// Start Server
server.listen(PORT, async () => {
  console.log(`========================================`);
  console.log(`OmniDimension Backend running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/api/stream`);
  console.log(`========================================`);

  // Recover any interrupted or scheduled campaigns from disk on reboot (Defect BUG-05)
  await recoverServerState();

  // Initial OmniDimension call logs fetch & campaign data enrichment
  setTimeout(() => {
    fetchCallsFromOmni(6)
      .then(() => enrichAllCampaigns())
      .catch(err => console.error('Initial Omni sync error:', err.message));
  }, 2000);
});



