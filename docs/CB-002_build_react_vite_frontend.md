# CB-002: Build React/Vite Frontend

**Story:** Build React/Vite frontend  
**Epic:** EPIC-01 — Frontend Production Build & IIS Packaging  
**Date:** 2026-11-26  
**Status:** ✅ PASS

---

## 1. Install Dependencies Reproducibly

```
npm ci
```

- **Result:** ✅ PASS — clean install from `package-lock.json` (lockfileVersion 3)
- All 1804 modules resolved from registry.npmjs.org
- No peer dependency conflicts

## 2. Run Production Build

```
npm run build:frontend
→ vite build --config frontend/vite.config.js
```

- **Result:** ✅ PASS — built in ~1.7s
- Vite v8.3.5, React plugin, Rolldown bundler
- Zero build errors or warnings

## 3. Output Directory Verification

| Check | Result |
|-------|--------|
| `dist/` exists at project root | ✅ |
| `dist/index.html` present (760 bytes) | ✅ |
| `dist/assets/` contains JS + CSS chunks | ✅ |
| No source maps (`.map` files) | ✅ |
| No sensitive files (`.env`, `.jsx`, `node_modules`) | ✅ |
| Build is reproducible (identical output on re-run) | ✅ |

### Build Output Manifest

| File | Size | Gzip |
|------|------|------|
| `index.html` | 0.76 KB | 0.40 KB |
| `assets/index-DgVu3-dD.css` | 31.31 KB | 6.77 KB |
| `assets/rolldown-runtime-pP25SEvz.js` | 0.98 KB | 0.56 KB |
| `assets/vendor-react-BN1iWyHP.js` | 182.04 KB | 57.29 KB |
| `assets/index-B4XpUKGU.js` | 367.57 KB | 77.67 KB |
| `assets/vendor-icons-BLYhqMJg.js` | 21.08 KB | 7.57 KB |
| `assets/vendor-exceljs-DvjSlv2L.js` | 929.38 KB | 256.38 KB |
| **Total JS+CSS** | **~1,533 KB** | **~407 KB** |

### Static Assets (copied to dist)

| File | Purpose |
|------|---------|
| `favicon.svg` | Browser tab icon |
| `icons.svg` | App icon sprite |
| `vidyavision-logo.png` / `.svg` | Brand logo |
| `guide.html` + `guide-assets/` (16 images) | User guide |

## 4. Build Errors / Blockers

**None.** Build completes cleanly with zero errors.

### Chunk Size Note

`vendor-exceljs` at 929 KB (256 KB gzipped) is the largest chunk. This is due to the full ExcelJS library being bundled for client-side Excel export. The Vite config already splits it into a separate chunk via `manualChunks`, so it only loads when needed.

## 5. Build Command Reference

| Command | Purpose |
|---------|---------|
| `npm ci` | Clean install from lockfile |
| `npm run build:frontend` | Production build (frontend only) |
| `npm run build` | Full build (frontend + backend obfuscation) |

## 6. Acceptance Criteria Status

| # | Criteria | Status |
|---|----------|--------|
| 1 | Install dependencies reproducibly using `npm ci` | ✅ |
| 2 | Run the production build using the project build command | ✅ |
| 3 | Confirm the expected output directory (`dist`) exists | ✅ |
| 4 | Capture build errors and resolve build-blocking issues | ✅ None found |
