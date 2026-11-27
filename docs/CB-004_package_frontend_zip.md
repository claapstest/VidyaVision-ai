# CB-004: Package Frontend ZIP

**Story:** Package frontend ZIP  
**Epic:** EPIC-01 — Frontend Production Build & IIS Packaging  
**Date:** 2026-11-27  
**Status:** ✅ PASS

---

## 1. What Was Done

Created an automated packaging script that produces a versioned, clean frontend ZIP ready for IIS deployment.

### New Files

| File | Purpose |
|------|---------|
| `scripts/package-frontend.js` | Automated ZIP packager |
| `release/vidyavision-frontend-v1.0.0-*.zip` | Output artifact (gitignored) |

### Changes

| File | Change |
|------|--------|
| `package.json` | Version bumped `0.0.0` → `1.0.0`; added `package:frontend` script |
| `.gitignore` | Added `release/` directory |

## 2. How to Package

```bash
# Build + package in sequence
npm run build:frontend
npm run package:frontend
```

Output: `release/vidyavision-frontend-v1.0.0-YYYYMMDD.zip`

## 3. ZIP Structure Verification

```
vidyavision-frontend-v1.0.0-20261127.zip
├── index.html              ← SPA entry (at root, not nested)
├── web.config              ← IIS SPA fallback + security headers
├── favicon.svg
├── icons.svg
├── vidyavision-logo.png
├── vidyavision-logo.svg
├── guide.html              ← Interactive user guide
├── assets/
│   ├── index-*.js          ← App bundle (367 KB)
│   ├── index-*.css         ← Styles (31 KB)
│   ├── rolldown-runtime-*.js
│   ├── vendor-react-*.js   ← React (182 KB)
│   ├── vendor-exceljs-*.js ← ExcelJS (929 KB)
│   └── vendor-icons-*.js   ← Lucide icons (21 KB)
└── guide-assets/
    └── *.png / *.jpg       ← 16 guide screenshots
```

**Total size:** 3.29 MB

## 4. What's Excluded

| Excluded Item | Reason |
|---------------|--------|
| `.map` files (source maps) | Would expose source code |
| `.jsx` / `.tsx` / `.ts` files | Source code |
| `.env` files | Contains secrets |
| `node_modules/` | Development dependencies |
| `.git/` | Repository metadata |
| `.DS_Store` / `Thumbs.db` | OS junk files |

## 5. Verification Results

| Check | Result |
|-------|--------|
| ZIP contains `index.html` at root (not nested in `dist/`) | ✅ |
| No source maps in ZIP | ✅ |
| No source code (`.jsx`, `.ts`) in ZIP | ✅ |
| No `.env` or secrets in ZIP | ✅ |
| No `node_modules` in ZIP | ✅ |
| No `.git` metadata in ZIP | ✅ |
| `web.config` included for IIS | ✅ |
| Versioned filename | ✅ `v1.0.0-20261127` |
| 38 files total | ✅ |

## 6. Acceptance Criteria Status

| # | Criteria | Status |
|---|----------|--------|
| 1 | Create a versioned frontend ZIP from production output | ✅ `vidyavision-frontend-v1.0.0-20261127.zip` |
| 2 | ZIP root contains `index.html` and assets (not nested `dist/` folder) | ✅ Verified |
| 3 | Exclude repo files, source maps/debug artifacts and dev dependencies | ✅ All excluded |
| 4 | Record artifact name and version | ✅ v1.0.0, logged by script |
