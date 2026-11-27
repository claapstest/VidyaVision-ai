# CB-003: Configure Base Path and SPA Routing

**Story:** Configure base path and SPA routing  
**Epic:** EPIC-01 — Frontend Production Build & IIS Packaging  
**Date:** 2026-11-27  
**Status:** ✅ PASS

---

## 1. What Was Done

### Base Path Configuration

Made the Vite `base` path configurable via `VITE_BASE_PATH` environment variable:

- **Default:** `/` (root deployment)
- **Subpath example:** `/callingbot/` (set `VITE_BASE_PATH=/callingbot/` before build)

**File changed:** `frontend/vite.config.js` — added `base: env.VITE_BASE_PATH || '/'`

### Hardcoded Path Fixes

Found and fixed **4 hardcoded absolute asset references** that would break under a subpath:

| File | Line | Before | After |
|------|------|--------|-------|
| `App.jsx` | ~3883 | `src="/vidyavision-logo.svg"` | `src={import.meta.env.BASE_URL + "vidyavision-logo.svg"}` |
| `App.jsx` | ~3950 | `src="/vidyavision-logo.svg"` | `src={import.meta.env.BASE_URL + "vidyavision-logo.svg"}` |
| `App.jsx` | ~4155 | `href="/guide.html"` | `href={import.meta.env.BASE_URL + "guide.html"}` |
| `LoginPage.jsx` | ~144 | `src="/vidyavision-logo.svg"` | `src={import.meta.env.BASE_URL + "vidyavision-logo.svg"}` |

`import.meta.env.BASE_URL` is replaced at build time by Vite with the configured base path.

### IIS web.config for SPA Fallback

Created `frontend/public/web.config` (auto-copied to `dist/` on build) with:

- **Default document:** `index.html`
- **URL Rewrite SPA fallback:** Any request that isn't a file, directory, or `/api/*` is rewritten to `index.html`
- **MIME types:** `.json`, `.woff`, `.woff2`, `.svg` registered
- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`

### .env.example Updated

Added `VITE_BASE_PATH=/` with documentation comment.

## 2. SPA Routing Analysis

This app uses **state-based navigation** (`activeTab` React state), **not URL-based routing** (no React Router). This means:

- There are no deep-linkable routes (all views are at the same URL)
- Page refresh always returns to the dashboard (login page if not authenticated)
- The IIS `web.config` SPA fallback ensures any direct URL hit serves `index.html`

## 3. Verification

### Root Deployment (`/`)

```
Build: ✅ PASS
Asset paths: /assets/index-*.js, /assets/index-*.css
favicon: /favicon.svg
web.config: Present in dist/
```

### Subpath Deployment (`/callingbot/`)

```
Build: ✅ PASS
Asset paths: /callingbot/assets/index-*.js, /callingbot/assets/index-*.css
favicon: /callingbot/favicon.svg
web.config: Present in dist/
```

## 4. How to Build for Each Scenario

**Root deployment** (app at `https://domain.com/`):
```bash
npm run build:frontend
```

**Subpath deployment** (app at `https://domain.com/callingbot/`):
```bash
# Windows
set VITE_BASE_PATH=/callingbot/
npm run build:frontend

# Or add to .env
VITE_BASE_PATH=/callingbot/
```

## 5. Acceptance Criteria Status

| # | Criteria | Status |
|---|----------|--------|
| 1 | Set the frontend base path to the agreed deployment path, if applicable | ✅ Configurable via `VITE_BASE_PATH` |
| 2 | Ensure asset URLs resolve under the deployment path | ✅ All 4 hardcoded paths fixed |
| 3 | Configure/verify client-side routing behavior | ✅ State-based (no URL routing), SPA fallback configured |
| 4 | Direct navigation and refresh on supported routes work after deployment | ✅ web.config rewrites to index.html |

## 6. Files Changed

| File | Change |
|------|--------|
| `frontend/vite.config.js` | Added configurable `base` path |
| `frontend/src/App.jsx` | Fixed 3 hardcoded asset paths → `import.meta.env.BASE_URL` |
| `frontend/src/components/LoginPage.jsx` | Fixed 1 hardcoded asset path |
| `frontend/public/web.config` | **NEW** — IIS SPA fallback + security headers |
| `.env.example` | Added `VITE_BASE_PATH` |
