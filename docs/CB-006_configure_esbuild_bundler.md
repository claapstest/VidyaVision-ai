# CB-006: Configure esbuild Bundler for Backend

## Summary
Configured esbuild as the backend JavaScript bundler to consolidate all backend source files and dependencies into a single file suitable for Node.js SEA packaging.

## Implementation
- **Script**: `scripts/build-backend.js`
- **Bundler**: esbuild v0.28.2
- **Config**: `platform: 'node'`, `target: 'node25'`, `format: 'esm'`, `bundle: true`
- **Entry point**: `backend/server.js`
- **Output**: `dist-server/server.bundle.mjs` (debug) and `dist-server/server.obfuscated.mjs` (production)
- **External packages**: None — all dependencies are bundled inline

## Key Decisions
- Used `format: 'esm'` because the codebase uses `"type": "module"` and has top-level `await` (incompatible with CJS output format in esbuild)
- Set `platform: 'node'` so Node.js built-in modules (`node:fs`, `node:http`, etc.) are treated as external
- Two-pass build: unminified for debugging, minified+mangled for production

## Usage
```powershell
npm run build:backend
```
