import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { transform } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const INPUT = join(root, 'dist-server', 'server.bundle.mjs');
const OUTPUT = join(root, 'dist-server', 'server.sea.js');

console.log('\n🔄 Converting ESM bundle to CJS-compatible SEA entry...');

let code = await readFile(INPUT, 'utf8');
const originalSize = (Buffer.byteLength(code) / 1024 / 1024).toFixed(2);
console.log(`   Input: server.bundle.mjs (${originalSize} MB)`);

let importCount = 0;

// Pattern: import X, { a, b } from "Y" (mixed default + named — must run before simpler patterns)
code = code.replace(/^import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']\s*;?\s*$/gm,
  (_, def, named, mod) => { importCount++; return `const ${def} = require("${mod}");\nconst {${named}} = require("${mod}");`; });

// Pattern: import { a, b } from "Y"
code = code.replace(/^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']\s*;?\s*$/gm,
  (_, named, mod) => { importCount++; return `const {${named}} = require("${mod}");`; });

// Pattern: import X from "Y"
code = code.replace(/^import\s+(\w+)\s+from\s*["']([^"']+)["']\s*;?\s*$/gm,
  (_, name, mod) => { importCount++; return `const ${name} = require("${mod}");`; });

// Pattern: import * as X from "Y"
code = code.replace(/^import\s*\*\s*as\s+(\w+)\s+from\s*["']([^"']+)["']\s*;?\s*$/gm,
  (_, name, mod) => { importCount++; return `const ${name} = require("${mod}");`; });

// Pattern: bare import "Y" (side effects only)
code = code.replace(/^import\s*["'][^"']+["']\s*;?\s*$/gm, () => { importCount++; return ''; });

// Replace import.meta.url with CJS equivalent
code = code.replace(/\bimport\.meta\.url\b/g, '__seaCjsUrl');

// Convert ESM "as" aliases in destructured require() to CJS ": alias" syntax
// e.g. const { PassThrough as PassThrough2 } → const { PassThrough: PassThrough2 }
code = code.replace(/const\s*\{([^}]+)\}\s*=\s*require\(/g, (match, inner) => {
  const fixed = inner.replace(/\b(\w+)\s+as\s+(\w+)\b/g, '$1: $2');
  return `const {${fixed}} = require(`;
});

// Remove export statements
code = code.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
code = code.replace(/^export\s+default\s+/gm, 'module.exports = ');

console.log(`   Converted ${importCount} import statements to require()`);

// Verify no unconverted import-from statements remain
const remaining = [...code.matchAll(/^import\s+.+?from\s*["']/gm)];
if (remaining.length > 0) {
  console.error(`   ❌ ${remaining.length} unconverted import statement(s):`);
  remaining.slice(0, 10).forEach(m => console.error(`     ${m[0].substring(0, 120)}`));
  console.error('   The CJS output will fail at runtime. Fix the patterns in esm-to-cjs.js.');
  process.exit(1);
}

// Warn about dynamic imports that require() cannot handle
const dynamicImports = [...code.matchAll(/\bimport\s*\(/g)];
if (dynamicImports.length > 0) {
  console.warn(`   ⚠ ${dynamicImports.length} dynamic import() call(s) found — these will fail in SEA CJS mode.`);
  console.warn('     If the EXE crashes at runtime, check for dynamic import() in the backend code.');
}

// Warn about remaining export statements
const exports = [...code.matchAll(/^export\s+/gm)];
if (exports.length > 0) {
  console.warn(`   ⚠ ${exports.length} unconverted export statement(s) — these may cause syntax errors.`);
}

// Wrap in async IIFE with CJS compatibility shims
code = `"use strict";
const __seaCjsUrl = typeof __filename !== "undefined"
  ? require("url").pathToFileURL(__filename).href
  : "";
(async () => {
${code}
})().catch((err) => {
  console.error("CallingBot fatal startup error:", err);
  process.exit(1);
});
`;

const rawSize = (Buffer.byteLength(code) / 1024 / 1024).toFixed(2);
console.log(`   CJS conversion done (${rawSize} MB)`);

// Minify with esbuild to reduce SEA blob size
console.log('   Minifying for SEA packaging...');
const minified = await transform(code, {
  minify: true,
  target: 'node25',
  legalComments: 'none',
  drop: ['debugger'],
});
code = minified.code;

await writeFile(OUTPUT, code, 'utf8');

const sizeMb = (Buffer.byteLength(code) / 1024 / 1024).toFixed(2);
console.log(`   ✓ dist-server/server.sea.js (${sizeMb} MB, ${((1 - Buffer.byteLength(code) / Buffer.byteLength(await readFile(INPUT))) * 100).toFixed(1)}% smaller than input)`);
console.log('✅ ESM to CJS conversion complete.\n');
