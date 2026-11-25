import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const LOW_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: [],
  transformObjectKeys: false,
  unicodeEscapeSequence: false
};

async function findJsFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findJsFiles(full));
    } else if (extname(entry.name) === '.js') {
      results.push(full);
    }
  }
  return results;
}

async function obfuscateFile(filePath) {
  const code = await readFile(filePath, 'utf8');
  if (code.length < 50) return;
  try {
    const result = JavaScriptObfuscator.obfuscate(code, LOW_OPTIONS);
    await writeFile(filePath, result.getObfuscatedCode(), 'utf8');
    console.log(`  ✓ ${filePath}`);
  } catch (err) {
    console.warn(`  ✗ ${filePath}: ${err.message}`);
  }
}

async function obfuscateServer() {
  const distServer = join(process.cwd(), 'dist-server');
  await mkdir(distServer, { recursive: true });

  for (const file of ['server.js', 'db.js']) {
    const src = join(process.cwd(), 'backend', file);
    try {
      const code = await readFile(src, 'utf8');
      const result = JavaScriptObfuscator.obfuscate(code, LOW_OPTIONS);
      await writeFile(join(distServer, file), result.getObfuscatedCode(), 'utf8');
      console.log(`  ✓ dist-server/${file}`);
    } catch (err) {
      console.warn(`  ✗ ${file}: ${err.message}`);
    }
  }
}

async function obfuscateFrontend() {
  const assetsDir = join(process.cwd(), 'dist', 'assets');
  try {
    const jsFiles = await findJsFiles(assetsDir);
    for (const f of jsFiles) {
      await obfuscateFile(f);
    }
  } catch (err) {
    console.warn(`  Frontend obfuscation skipped: ${err.message}`);
  }
}

console.log('\n🔒 Obfuscating frontend (dist/assets/*.js)...');
await obfuscateFrontend();
console.log('\n🔒 Obfuscating backend (dist-server/)...');
await obfuscateServer();
console.log('\n✅ Obfuscation complete.\n');
