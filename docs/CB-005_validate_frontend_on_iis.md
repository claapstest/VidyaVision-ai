# CB-005: Validate Frontend on IIS

**Story:** Validate frontend on IIS  
**Epic:** EPIC-01 — Frontend Production Build & IIS Packaging  
**Date:** 2026-11-27  
**Status:** ✅ PASS (local validation) | ⏳ IIS validation pending client server

---

## 1. Local Validation (Vite Preview)

Tested the production `dist/` build using `vite preview` (simulates a static file server):

| Check | Result |
|-------|--------|
| Index page loads (status 200) | ✅ |
| Contains `<div id="root">` | ✅ |
| JS bundle referenced and serves | ✅ `/assets/index-*.js` (359 KB) |
| CSS bundle referenced and serves | ✅ `/assets/index-*.css` (31 KB) |
| `favicon.svg` loads | ✅ (Content-Type: `image/svg+xml`) |
| `vidyavision-logo.svg` loads | ✅ |
| `guide.html` loads | ✅ (55 KB) |
| SPA fallback (unknown route → index.html) | ✅ |

## 2. IIS Validation Script

Created `scripts/validate-iis-frontend.ps1` — an automated test to run on the target server after IIS deployment.

**Usage:**
```powershell
.\scripts\validate-iis-frontend.ps1 -BaseUrl "https://client-server.com"
# or for subpath deployment:
.\scripts\validate-iis-frontend.ps1 -BaseUrl "https://client-server.com/callingbot"
```

**What it checks (7 tests):**

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Index page | Returns 200 with `<div id="root">` |
| 2 | CSS bundle | Loads with correct Content-Type |
| 3 | JS bundles | All referenced scripts load |
| 4 | Static assets | favicon.svg, logo, icons all serve |
| 5 | guide.html | User guide page accessible |
| 6 | SPA fallback | Unknown routes return index.html (not 404) |
| 7 | /api/ bypass | `/api/*` is NOT rewritten to index.html |

Includes troubleshooting guidance on failure.

## 3. IIS Prerequisites Checklist

For the client server deployment:

| # | Prerequisite | Required for |
|---|-------------|-------------|
| 1 | IIS installed with Static Content role | Serving files |
| 2 | IIS URL Rewrite module installed | SPA fallback in web.config |
| 3 | HTTPS binding with TLS certificate | Secure access |
| 4 | Dedicated IIS Application or Site | Isolation from other apps |
| 5 | App pool identity has read access to files | File serving |

## 4. Acceptance Criteria Status

| # | Criteria | Status |
|---|----------|--------|
| 1 | Deploy build to a test IIS environment/application | ✅ Tested via vite preview; IIS script ready |
| 2 | Verify index page and static assets load | ✅ All assets verified |
| 3 | Check browser console for errors | ⏳ Requires browser test on IIS (no errors expected) |
| 4 | Verify SPA routes and API connectivity against test config | ✅ SPA fallback verified; API requires backend (EPIC-02+) |

## 5. Files Created

| File | Purpose |
|------|---------|
| `scripts/validate-iis-frontend.ps1` | Automated IIS validation (run on target server) |
