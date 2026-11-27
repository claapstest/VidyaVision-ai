import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const externalPackages = [];

console.log('\n📦 Bundling backend with esbuild...');
console.log(`   Entry: backend/server.js`);
console.log(`   Format: ESM (Node.js 22+ SEA supports ESM)\n`);

// Step 1: Unminified bundle (for debugging)
console.log('   [1/2] Building debug bundle...');
const debugResult = await build({
  entryPoints: [join(root, 'backend', 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node25',
  format: 'esm',
  outfile: join(root, 'dist-server', 'server.bundle.mjs'),
  external: externalPackages,
  minify: false,
  sourcemap: false,
  metafile: true,
  banner: {
    js: [
      '// CallingBot Backend — Bundled for SEA packaging',
      `// Version: ${pkg.version || '1.0.0'}`,
      `// Built: ${new Date().toISOString()}`,
      `// Node target: ${process.version}`,
      '',
    ].join('\n'),
  },
  logLevel: 'warning',
});

const inputs = Object.keys(debugResult.metafile.inputs).length;
const debugSize = Object.values(debugResult.metafile.outputs)[0].bytes;
console.log(`         ✓ server.bundle.mjs (${(debugSize / 1024).toFixed(1)} KB, ${inputs} modules)`);

// Step 2: Minified + mangled bundle (production obfuscation)
console.log('   [2/2] Building production bundle (minified + mangled)...');
const prodResult = await build({
  entryPoints: [join(root, 'backend', 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node25',
  format: 'esm',
  outfile: join(root, 'dist-server', 'server.obfuscated.mjs'),
  external: externalPackages,
  minify: true,
  mangleProps: /^_[a-z]/,
  legalComments: 'none',
  sourcemap: false,
  metafile: true,
  drop: ['debugger'],
  logLevel: 'warning',
});

const prodSize = Object.values(prodResult.metafile.outputs)[0].bytes;
const ratio = ((1 - prodSize / debugSize) * 100).toFixed(1);
console.log(`         ✓ server.obfuscated.mjs (${(prodSize / 1024).toFixed(1)} KB, ${ratio}% smaller)`);

console.log('\n✅ Backend bundle complete.\n');
