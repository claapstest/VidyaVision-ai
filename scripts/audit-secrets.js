import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, _resetConfigCacheForTesting, REQUIRED_FIELDS, OPTIONAL_FIELDS } from '../backend/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

console.log('\n========================================');
console.log('  CallingBot Security & Secrets Audit (CB-017 / TC-012)');
console.log('========================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

// 1. Audit Template Configuration Files
console.log('[1/4] Auditing configuration templates for secret leaks...');
const templatePath = join(root, 'config', 'callingbot.template.json');
const releaseTemplatePath = join(root, 'release', 'config', 'callingbot.template.json');
const envExamplePath = join(root, '.env.example');

const templates = [
  { name: 'config/callingbot.template.json', path: templatePath },
  { name: 'release/config/callingbot.template.json', path: releaseTemplatePath },
];

for (const tmpl of templates) {
  if (existsSync(tmpl.path)) {
    const raw = readFileSync(tmpl.path, 'utf8');
    const parsed = JSON.parse(raw);
    const secretKeys = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].filter(f => f.secret).map(f => f.key);

    for (const key of secretKeys) {
      const val = parsed[key];
      if (val !== undefined && val !== '') {
        const isPlaceholder = typeof val === 'string' && val.startsWith('<') && val.endsWith('>');
        assert(isPlaceholder, `${tmpl.name} key "${key}" contains placeholder, got: "${val.slice(0, 4)}***"`);
      }
    }
  } else {
    assert(false, `Template missing: ${tmpl.name}`);
  }
}

if (existsSync(envExamplePath)) {
  const envContent = readFileSync(envExamplePath, 'utf8');
  assert(!envContent.includes('vidyavision-secure-jwt-key-2026'), '.env.example does not contain hardcoded default JWT secret');
  assert(envContent.includes('JWT_SECRET=your_secure_random_jwt_secret_min_32_chars'), '.env.example uses placeholder for JWT_SECRET');
  assert(envContent.includes('MSSQL_PASSWORD=your_sql_server_password'), '.env.example uses placeholder for MSSQL_PASSWORD');
}

// 2. Audit Client & Frontend Bundles (No backend secrets in client bundles)
console.log('\n[2/4] Auditing client bundles and frontend source for leaked secrets...');
const frontendSrcDir = join(root, 'frontend', 'src');
const frontendDistDir = join(root, 'dist');

function searchDir(dir, patterns) {
  const matches = [];
  if (!existsSync(dir)) return matches;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      matches.push(...searchDir(full, patterns));
    } else if (st.isFile() && /\.(jsx?|tsx?|html|json)$/i.test(entry)) {
      const content = readFileSync(full, 'utf8');
      for (const pat of patterns) {
        if (pat.regex.test(content)) {
          matches.push({ file: full, name: pat.name });
        }
      }
    }
  }
  return matches;
}

const forbiddenPatterns = [
  { name: 'Hardcoded JWT Secret fallback', regex: /vidyavision-secure-jwt-key-2026/ },
  { name: 'Hardcoded SQL Password in frontend', regex: /MSSQL_PASSWORD\s*[:=]\s*['"][^'"]+['"]/i },
  { name: 'Database connection string', regex: /Server=tcp:[^;]+;Database=[^;]+;User Id=[^;]+;Password=[^;]+/i },
];

const frontendMatches = searchDir(frontendSrcDir, forbiddenPatterns);
assert(frontendMatches.length === 0, `Frontend source contains no forbidden secret patterns (matches: ${frontendMatches.length})`);

if (existsSync(frontendDistDir)) {
  const distMatches = searchDir(frontendDistDir, forbiddenPatterns);
  assert(distMatches.length === 0, `Frontend production dist contains no leaked backend secrets (matches: ${distMatches.length})`);
} else {
  console.log('  ℹ (dist/ directory not built yet; skipped frontend dist check)');
}

// 3. Audit Backend Bundles for Hardcoded Secret Fallbacks
console.log('\n[3/4] Auditing backend bundle for hardcoded fallback secrets...');
const backendBundlePath = join(root, 'dist-server', 'server.sea.js');
if (existsSync(backendBundlePath)) {
  const bundleContent = readFileSync(backendBundlePath, 'utf8');
  assert(!bundleContent.includes('vidyavision-secure-jwt-key-2026'), 'Backend bundle does not contain hardcoded JWT fallback string');
} else {
  console.log('  ℹ (dist-server/server.sea.js not built yet; will be validated during build)');
}

// 4. Test Runtime Secret Masking & Safe Error Logging
console.log('\n[4/4] Verifying secret masking and error logging behavior...');
const originalLog = console.log;
const originalErr = console.error;

let capturedLogs = '';
let capturedErrors = '';

console.log = (...args) => { capturedLogs += args.join(' ') + '\n'; };
console.error = (...args) => { capturedErrors += args.join(' ') + '\n'; };

try {
  _resetConfigCacheForTesting();
  delete process.env.CALLINGBOT_CONFIG;

  // Check that real-looking simulated values are never printed raw
  const testSecret = 'SUPER_SECRET_TOKEN_XYZ_12345';
  process.env.MSSQL_HOST = 'localhost';
  process.env.MSSQL_DATABASE = 'vidyavision';
  process.env.JWT_SECRET = testSecret;
  process.env.MSSQL_PASSWORD = 'DATABASE_SECRET_PASSWORD_987';
  process.env.OMNIDIM_API_KEY = 'OMNI_KEY_SECRET_555';

  capturedLogs = '';
  loadConfig({ forceReload: true, noExitOnFailure: true });

  assert(!capturedLogs.includes(testSecret), 'JWT_SECRET is masked in logs (raw secret not printed)');
  assert(!capturedLogs.includes('DATABASE_SECRET_PASSWORD_987'), 'MSSQL_PASSWORD is masked in logs');
  assert(!capturedLogs.includes('OMNI_KEY_SECRET_555'), 'OMNIDIM_API_KEY is masked in logs');
  assert(capturedLogs.includes('SU********45'), 'JWT_SECRET is formatted with partial mask (SU********45)');
} finally {
  console.log = originalLog;
  console.error = originalErr;
  delete process.env.CALLINGBOT_CONFIG;
  _resetConfigCacheForTesting();
}

console.log('\n========================================');
console.log(`Security Audit Results: ${passCount} Passed, ${failCount} Failed`);
console.log('========================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✓ CB-017 / TC-012 Security secrets audit completed successfully.\n');
}
