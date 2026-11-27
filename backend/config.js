import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

export const REQUIRED_FIELDS = [
  { key: 'PORT', type: 'number', default: 5000 },
  { key: 'MSSQL_HOST', type: 'string' },
  { key: 'MSSQL_DATABASE', type: 'string' },
  { key: 'JWT_SECRET', type: 'string', secret: true },
];

export const OPTIONAL_FIELDS = [
  { key: 'MSSQL_PORT', type: 'number', default: 1433 },
  { key: 'MSSQL_USER', type: 'string', default: 'sa' },
  { key: 'MSSQL_PASSWORD', type: 'string', secret: true, default: '' },
  { key: 'MSSQL_ENCRYPT', type: 'boolean', default: false },
  { key: 'MSSQL_TRUST_CERT', type: 'boolean', default: true },
  { key: 'OMNIDIM_BASE_URL', type: 'string', default: 'https://backend.omnidim.io' },
  { key: 'OMNIDIM_API_KEY', type: 'string', secret: true, default: '' },
  { key: 'AGENT_ID', type: 'string', default: '' },
  { key: 'UG_AGENT_ID', type: 'string', default: '' },
  { key: 'PG_AGENT_ID', type: 'string', default: '' },
  { key: 'ALLOWED_ORIGINS', type: 'string', default: '' },
  { key: 'WEBHOOK_SECRET', type: 'string', secret: true, default: '' },
  { key: 'APP_API_KEY', type: 'string', secret: true, default: '' },
  { key: 'GOOGLE_SPREADSHEET_ID', type: 'string', default: '' },
  { key: 'GOOGLE_SHEET_NAME', type: 'string', default: 'Sheet1' },
  { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', type: 'string', secret: true, default: '' },
  { key: 'NODE_ENV', type: 'string', default: 'production' },
  { key: 'LOG_LEVEL', type: 'string', default: 'info' },
  { key: 'DEBUG_SQL', type: 'boolean', default: false },
  { key: 'WRITE_CACHE_FILE', type: 'boolean', default: false },
];

function maskSecret(value) {
  if (!value || typeof value !== 'string') return '***';
  if (value.length <= 4) return '***';
  return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 8)) + value.slice(-2);
}

function coerceType(value, type) {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  switch (type) {
    case 'number': {
      const n = Number(str);
      return isNaN(n) ? undefined : n;
    }
    case 'boolean': {
      const lower = str.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      return undefined;
    }
    default:
      return str;
  }
}

function loadConfigFile(configPath) {
  const resolved = resolve(configPath);
  if (!existsSync(resolved)) {
    console.error(`[CONFIG] FATAL: Config file not found: ${resolved}`);
    console.error('[CONFIG] Set CALLINGBOT_CONFIG to a valid JSON config file path.');
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(resolved, 'utf8');
  } catch (err) {
    console.error(`[CONFIG] FATAL: Cannot read config file: ${err.message}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[CONFIG] FATAL: Config file is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error('[CONFIG] FATAL: Config file must contain a JSON object.');
    process.exit(1);
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && value !== null) {
      process.env[key] = String(value);
    }
  }

  console.log(`[CONFIG] Loaded config from: ${resolved}`);
  return resolved;
}

let _loaded = false;
let _configResult = null;

export function _resetConfigCacheForTesting() {
  _loaded = false;
  _configResult = null;
}

export function loadConfig(options = {}) {
  if (_loaded && !options.forceReload) {
    return _configResult;
  }

  let configPath = process.env.CALLINGBOT_CONFIG;

  if (!configPath) {
    // Auto-discover configuration in standard Windows application layout (CB-018)
    const layoutCandidates = [
      resolve(process.cwd(), 'Config', 'callingbot.json'),
      resolve(process.cwd(), 'config', 'callingbot.json'),
      resolve(process.cwd(), '..', 'Config', 'callingbot.json'),
      resolve(process.cwd(), '..', 'config', 'callingbot.json'),
    ];
    for (const cand of layoutCandidates) {
      if (existsSync(cand)) {
        configPath = cand;
        break;
      }
    }
  }

  if (configPath) {
    loadConfigFile(configPath);
  } else {
    dotenv.config({ quiet: true });
  }

  const errors = [];
  const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

  for (const field of allFields) {
    let value = process.env[field.key];

    if ((value === undefined || value === '') && field.default !== undefined) {
      process.env[field.key] = String(field.default);
      value = String(field.default);
    }

    if (REQUIRED_FIELDS.includes(field) && (value === undefined || value === '')) {
      errors.push(`Missing required config: ${field.key}`);
      continue;
    }

    if (value !== undefined && value !== '') {
      const coerced = coerceType(value, field.type);
      if (coerced === undefined) {
        const displayVal = field.secret ? maskSecret(value) : `"${value}"`;
        errors.push(`Invalid type for ${field.key}: expected ${field.type}, got ${displayVal}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('[CONFIG] FATAL: Configuration validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    console.error('\n[CONFIG] Create a config file and set CALLINGBOT_CONFIG, or provide a .env file.');
    if (!options.noExitOnFailure) {
      process.exit(1);
    }
    const err = new Error('Configuration validation failed: ' + errors.join('; '));
    err.validationErrors = errors;
    throw err;
  }

  console.log('[CONFIG] Configuration loaded successfully:');
  for (const field of allFields) {
    const value = process.env[field.key];
    if (value === undefined || value === '') continue;
    const display = field.secret ? maskSecret(value) : value;
    console.log(`  ${field.key} = ${display}`);
  }

  _loaded = true;
  _configResult = {
    source: configPath ? resolve(configPath) : '.env',
  };

  return _configResult;
}
