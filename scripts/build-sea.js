import { writeFile, copyFile, readFile, mkdir, access, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const releaseDir = join(root, 'release');
const distServer = join(root, 'dist-server');

const SEA_INPUT_REL = './dist-server/server.sea.js';
const SEA_INPUT = join(root, 'dist-server', 'server.sea.js');
const SEA_CONFIG = join(root, 'sea-config.json');
const SEA_BLOB_REL = './dist-server/sea-prep.blob';
const SEA_BLOB = join(root, 'dist-server', 'sea-prep.blob');
const EXE_NAME = 'CallingBot.exe';
const EXE_PATH = join(releaseDir, EXE_NAME);

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

console.log('\n🚀 Building CallingBot standalone EXE (Node.js SEA)...');
console.log(`   Node: ${process.version}`);
console.log(`   Arch: ${process.arch}`);
console.log(`   Platform: ${process.platform}\n`);

if (!await fileExists(SEA_INPUT)) {
  console.error('❌ Obfuscated bundle not found at dist-server/server.obfuscated.mjs');
  console.error('   Run: node scripts/build-backend.js');
  process.exit(1);
}

await mkdir(releaseDir, { recursive: true });

// Step 1: Write SEA configuration (relative paths required)
console.log('   [1/4] Writing SEA configuration...');
const seaConfig = {
  main: SEA_INPUT_REL,
  output: SEA_BLOB_REL,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
};
await writeFile(SEA_CONFIG, JSON.stringify(seaConfig, null, 2), 'utf8');
console.log('         ✓ sea-config.json');

// Step 2: Generate SEA blob
console.log('   [2/4] Generating SEA preparation blob...');
try {
  const output = execSync('node --experimental-sea-config sea-config.json', {
    cwd: root,
    stdio: 'pipe',
    timeout: 120000,
  });
  console.log('         ✓ sea-prep.blob generated');
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString() : '';
  const stdout = err.stdout ? err.stdout.toString() : '';
  if (stdout.includes('Wrote single executable') || stderr.includes('ExperimentalWarning')) {
    console.log('         ✓ sea-prep.blob generated');
  } else {
    console.error('❌ SEA blob generation failed:');
    console.error(stderr.substring(0, 500) || stdout.substring(0, 500) || err.message);
    process.exit(1);
  }
}

if (!await fileExists(SEA_BLOB)) {
  console.error('❌ SEA blob was not generated.');
  process.exit(1);
}

// Step 3: Copy node.exe as CallingBot.exe
console.log('   [3/4] Copying Node runtime as CallingBot.exe...');
await copyFile(process.execPath, EXE_PATH);
const nodeSize = (await stat(process.execPath)).size;
console.log(`         ✓ ${EXE_NAME} (${(nodeSize / 1024 / 1024).toFixed(1)} MB base)`);

// Step 4: Inject SEA blob into EXE using postject
console.log('   [4/4] Injecting SEA blob into EXE...');
try {
  execSync(
    `npx --yes postject@1.0.0-alpha.6 "${EXE_PATH}" NODE_SEA_BLOB "${SEA_BLOB}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`,
    { cwd: root, stdio: 'pipe', timeout: 180000 }
  );
  console.log('         ✓ SEA blob injected');
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString() : '';
  if (stderr.includes('already') || err.status === 0) {
    console.log('         ✓ SEA blob injected (overwrite)');
  } else {
    console.error('❌ SEA blob injection failed:');
    console.error(stderr.substring(0, 500) || err.message);
    process.exit(1);
  }
}

// Final report
const exeStats = await stat(EXE_PATH);
const sizeMb = (exeStats.size / 1024 / 1024).toFixed(2);
const blobStats = await stat(SEA_BLOB);
const blobMb = (blobStats.size / 1024 / 1024).toFixed(2);

console.log(`\n   📋 Release Summary:`);
console.log(`      Executable:  release/${EXE_NAME}`);
console.log(`      EXE size:    ${sizeMb} MB`);
console.log(`      Blob size:   ${blobMb} MB`);
console.log(`      Node:        ${process.version}`);
console.log(`      Arch:        ${process.arch} (Windows x64)`);
console.log('✅ Standalone EXE build complete.\n');
