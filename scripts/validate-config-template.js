import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, loadConfig, _resetConfigCacheForTesting } from '../backend/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const templatePath = join(root, 'config', 'callingbot.template.json');
const releaseTemplatePath = join(root, 'release', 'config', 'callingbot.template.json');

console.log('\n========================================');
console.log('  CallingBot Configuration Template Validation (CB-016)');
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

// 1. Verify template files exist
console.log('[1/5] Verifying template file existence...');
assert(existsSync(templatePath), `config/callingbot.template.json exists at ${templatePath}`);
assert(existsSync(releaseTemplatePath), `release/config/callingbot.template.json exists at ${releaseTemplatePath}`);

// 2. Verify valid JSON syntax
console.log('\n[2/5] Validating JSON syntax and structure...');
let template;
try {
  const raw = readFileSync(templatePath, 'utf8');
  template = JSON.parse(raw);
  assert(true, 'Template is valid JSON');
  assert(typeof template === 'object' && !Array.isArray(template), 'Template is a JSON object');
} catch (err) {
  assert(false, `Template failed JSON parse: ${err.message}`);
  process.exit(1);
}

// 3. Verify coverage of all required and optional schema fields
console.log('\n[3/5] Verifying schema field coverage...');
for (const field of REQUIRED_FIELDS) {
  assert(field.key in template, `Required field "${field.key}" present in template`);
}

// Required domain coverage checks from CB-016 story definition:
// - environment
assert('NODE_ENV' in template, 'Environment setting (NODE_ENV) present');
// - port
assert('PORT' in template && typeof template.PORT === 'number', 'Port setting (PORT) present as number');
// - SQL endpoint/database
assert('MSSQL_HOST' in template, 'SQL endpoint (MSSQL_HOST) present');
assert('MSSQL_PORT' in template && typeof template.MSSQL_PORT === 'number', 'SQL port (MSSQL_PORT) present as number');
assert('MSSQL_DATABASE' in template, 'SQL database (MSSQL_DATABASE) present');
assert('MSSQL_USER' in template, 'SQL user (MSSQL_USER) present');
assert('MSSQL_PASSWORD' in template, 'SQL password (MSSQL_PASSWORD) present');
assert('MSSQL_ENCRYPT' in template && typeof template.MSSQL_ENCRYPT === 'boolean', 'SQL encryption (MSSQL_ENCRYPT) present as boolean');
assert('MSSQL_TRUST_CERT' in template && typeof template.MSSQL_TRUST_CERT === 'boolean', 'SQL certificate trust (MSSQL_TRUST_CERT) present as boolean');
// - provider URL
assert('OMNIDIM_BASE_URL' in template, 'Calling provider URL (OMNIDIM_BASE_URL) present');
assert('OMNIDIM_API_KEY' in template, 'Provider API key (OMNIDIM_API_KEY) present');
// - logging settings
assert('LOG_LEVEL' in template, 'Logging setting (LOG_LEVEL) present');
assert('DEBUG_SQL' in template && typeof template.DEBUG_SQL === 'boolean', 'SQL debug logging (DEBUG_SQL) present as boolean');

// 4. Verify placeholders are used for all secret fields (no hardcoded secrets)
console.log('\n[4/5] Verifying no raw secrets or real credentials in template...');
const secretFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].filter(f => f.secret);
for (const secretField of secretFields) {
  const val = template[secretField.key];
  if (val !== undefined && val !== '') {
    const isPlaceholder = val.startsWith('<') && val.endsWith('>');
    assert(isPlaceholder, `Secret field "${secretField.key}" uses placeholder format (<...>), got: "${val.slice(0, 3)}***"`);
  }
}

// 5. Test validation with the backend configuration loader
console.log('\n[5/5] Testing template against application configuration loader (backend/config.js)...');

// Test 5a: Load config from template directly
try {
  _resetConfigCacheForTesting();
  process.env.CALLINGBOT_CONFIG = templatePath;
  const result = loadConfig({ forceReload: true, noExitOnFailure: true });
  assert(result.source === templatePath, `loadConfig successfully loaded template from ${result.source}`);
  assert(process.env.PORT === String(template.PORT), `PORT correctly loaded into process.env (${process.env.PORT})`);
  assert(process.env.MSSQL_HOST === template.MSSQL_HOST, `MSSQL_HOST correctly loaded into process.env (${process.env.MSSQL_HOST})`);
  assert(process.env.OMNIDIM_BASE_URL === template.OMNIDIM_BASE_URL, `OMNIDIM_BASE_URL correctly loaded into process.env (${process.env.OMNIDIM_BASE_URL})`);
  assert(process.env.LOG_LEVEL === template.LOG_LEVEL, `LOG_LEVEL correctly loaded into process.env (${process.env.LOG_LEVEL})`);
} catch (err) {
  assert(false, `loadConfig failed to load template: ${err.message}`);
} finally {
  delete process.env.CALLINGBOT_CONFIG;
  _resetConfigCacheForTesting();
}

// Test 5b: Confirm type validation rejection for invalid boolean or number
console.log('\nTesting validation negative test cases...');
const tempBadConfig = join(root, 'config', '_temp_bad_config.json');
try {
  _resetConfigCacheForTesting();
  const badData = { ...template, MSSQL_ENCRYPT: 'not-a-boolean' };
  writeFileSync(tempBadConfig, JSON.stringify(badData), 'utf8');

  process.env.CALLINGBOT_CONFIG = tempBadConfig;
  let threw = false;
  try {
    loadConfig({ forceReload: true, noExitOnFailure: true });
  } catch (err) {
    threw = true;
    assert(err.message.includes('Invalid type for MSSQL_ENCRYPT'), `Caught expected error: ${err.message}`);
  }
  assert(threw, 'Invalid boolean type threw validation error');
} finally {
  if (existsSync(tempBadConfig)) {
    unlinkSync(tempBadConfig);
  }
  delete process.env.CALLINGBOT_CONFIG;
  _resetConfigCacheForTesting();
}

console.log('\n========================================');
console.log(`Validation Results: ${passCount} Passed, ${failCount} Failed`);
console.log('========================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✓ All CB-016 configuration template checks passed successfully.\n');
}
