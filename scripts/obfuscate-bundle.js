import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const BUNDLE_INPUT = join(root, 'dist-server', 'server.bundle.mjs');
const BUNDLE_OUTPUT = join(root, 'dist-server', 'server.obfuscated.js');

const OBFUSCATION_OPTIONS = {
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
  unicodeEscapeSequence: false,
};

console.log('\n🔒 Obfuscating backend bundle...');
console.log(`   Input:  dist-server/server.bundle.mjs`);
console.log(`   Output: dist-server/server.obfuscated.js\n`);

try {
  const code = await readFile(BUNDLE_INPUT, 'utf8');
  const originalSize = (Buffer.byteLength(code) / 1024 / 1024).toFixed(2);
  console.log(`   Original bundle size: ${originalSize} MB`);

  const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATION_OPTIONS);
  const obfuscated = result.getObfuscatedCode();
  const obfSize = (Buffer.byteLength(obfuscated) / 1024 / 1024).toFixed(2);

  await writeFile(BUNDLE_OUTPUT, obfuscated, 'utf8');
  console.log(`   Obfuscated size: ${obfSize} MB`);
  console.log('✅ Obfuscation complete.\n');
} catch (err) {
  console.error('❌ Obfuscation failed:', err.message);
  process.exit(1);
}
