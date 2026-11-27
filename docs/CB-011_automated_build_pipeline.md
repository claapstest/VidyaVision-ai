# CB-011: Automated Build Pipeline

## Summary
End-to-end build pipeline scripts that produce the standalone EXE from source with a single command.

## Pipeline Steps
```
backend/server.js
  → [build-backend.js] esbuild bundle (ESM)
  → dist-server/server.bundle.mjs (36 MB, debug)
  → dist-server/server.obfuscated.mjs (15 MB, production)

dist-server/server.bundle.mjs
  → [esm-to-cjs.js] import conversion + minification
  → dist-server/server.sea.js (15 MB, CJS)

dist-server/server.sea.js
  → [build-sea.js] SEA blob + postject injection
  → release/CallingBot.exe (102 MB)
```

## npm Scripts
| Script | Description |
|--------|-------------|
| `build:backend` | Bundle backend with esbuild (ESM debug + production) |
| `build:backend:cjs` | Convert ESM bundle to CJS for SEA |
| `build:backend:exe` | Generate SEA blob and inject into EXE |
| `build:backend:all` | Full pipeline: bundle → CJS → EXE |
| `validate:backend` | Run validation test suite on the EXE |

## Full Build Command
```powershell
npm run build:backend:all
npm run validate:backend
```

## Build Scripts
- `scripts/build-backend.js` — esbuild bundler configuration
- `scripts/esm-to-cjs.js` — ESM→CJS converter with minification
- `scripts/build-sea.js` — SEA blob generation and EXE packaging
- `scripts/validate-backend-exe.ps1` — Post-build validation test suite
