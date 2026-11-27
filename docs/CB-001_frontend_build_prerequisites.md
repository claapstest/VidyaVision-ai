# CB-001: Frontend Build Prerequisites Validation

**Story:** Validate frontend build prerequisites  
**Epic:** EPIC-01 — Frontend Production Build & IIS Packaging  
**Date:** 2026-11-26  
**Status:** ✅ PASS (with noted items)

---

## 1. Node.js / npm Version Compatibility

| Tool    | Installed Version | Required By    | Compatible |
|---------|-------------------|----------------|------------|
| Node.js | v25.0.0           | Vite 8.x (≥18) | ✅ Yes     |
| npm     | 11.6.2            | lockfileVersion 3 | ✅ Yes   |

- **Lockfile:** `package-lock.json` uses `lockfileVersion: 3` — compatible with npm 7+.
- **Module type:** `"type": "module"` (ESM) — supported on Node 18+.

## 2. Repository & Package Registry Access

| Check                            | Result |
|----------------------------------|--------|
| `npm ci` (clean install)         | ✅ PASS — after lockfile sync (see blocker below) |
| Registry access (registry.npmjs.org) | ✅ PASS |
| All dependencies resolved        | ✅ PASS |

### ⚠️ Blocker Found & Resolved

**`package-lock.json` was out of sync with `package.json`.**

Two devDependencies added in commit `eed5f15` were missing from the lockfile:
- `javascript-obfuscator@^5.10.1`
- `vite-plugin-obfuscator@^1.0.5`

**Fix applied:** Ran `npm install` to regenerate `package-lock.json`. Verified `npm ci` succeeds afterward.

## 3. Frontend API Endpoint / Configuration Approach

The frontend uses **relative `/api/` paths** for all backend calls (no hardcoded hostnames):

```
fetch('/api/auth/login', ...)
fetch('/api/campaigns', ...)
fetch('/api/colleges', ...)
ws://<host>/api/stream
```

**Deployment implication:**
- In development: Vite proxy forwards `/api/*` → `http://127.0.0.1:<PORT>`
- In production (IIS): A reverse proxy or URL Rewrite rule must route `/api/*` to the backend service port
- No `VITE_` environment variables are used — the app discovers the backend via the same host
- The backend port is read from `.env` `PORT` variable (currently `5005`)

## 4. Frontend Build Verification

| Check                              | Result |
|------------------------------------|--------|
| `npm run build:frontend`           | ✅ PASS — built in 1.79s |
| Output directory: `dist/`          | ✅ Exists at project root |
| `dist/index.html` present          | ✅ Yes |
| Static assets in `dist/assets/`    | ✅ Yes |
| Chunk splitting configured         | ✅ vendor-react, vendor-exceljs, vendor-icons |

### Build Output

| File                        | Size      | Gzip    |
|-----------------------------|-----------|---------|
| `index.html`                | 0.76 KB   | 0.40 KB |
| `index-*.css`               | 31.31 KB  | 6.77 KB |
| `vendor-react-*.js`         | 182.04 KB | 57.29 KB|
| `index-*.js`                | 367.57 KB | 77.67 KB|
| `vendor-exceljs-*.js`       | 929.38 KB | 256.38 KB|
| `vendor-icons-*.js`         | 21.08 KB  | 7.57 KB |

**Note:** `vendor-exceljs` is the largest chunk (929 KB). Consider lazy-loading if bundle size becomes a concern for the client.

## 5. Security Audit Summary

`npm audit` reports **12 vulnerabilities** (8 moderate, 4 high):

| Package     | Severity | Issue                              | Fix Available |
|-------------|----------|------------------------------------|---------------|
| `glob`      | Moderate | AbortSignal cancellation bypass    | `npm audit fix` |
| `minimatch` | Moderate | globparts DoS amplification        | `npm audit fix` |
| `uuid`      | Moderate | Missing buffer bounds check        | Breaking change (exceljs downgrade) |
| `zod`       | High     | (via googleapis dependency chain)  | `npm audit fix` |

**Recommendation:** Run `npm audit fix` for non-breaking fixes before release packaging. The `uuid` issue requires an `exceljs` major downgrade — assess risk vs. impact.

## 6. Project Structure Summary

```
VidyaVision-ai/
├── frontend/
│   ├── vite.config.js        ← Vite 8.x config (React plugin, proxy, chunking)
│   ├── index.html             ← SPA entry point
│   └── src/
│       ├── App.jsx            ← Main application (~8000+ lines)
│       ├── main.jsx           ← React root mount
│       └── components/        ← LoginPage, modals, charts, etc.
├── backend/
│   ├── server.js              ← Express backend entry
│   ├── db.js                  ← MSSQL database layer
│   └── scripts/               ← Build/obfuscation/DB scripts
├── dist/                      ← Frontend build output
├── package.json               ← Monorepo-style (frontend + backend)
├── package-lock.json          ← lockfileVersion 3
├── .env                       ← Runtime configuration (secrets)
└── .env.example               ← Template (safe to distribute)
```

## 7. Prerequisites Checklist

| # | Prerequisite                                | Status |
|---|---------------------------------------------|--------|
| 1 | Node.js ≥ 18 on build machine               | ✅ v25.0.0 |
| 2 | npm ≥ 7 on build machine                    | ✅ 11.6.2 |
| 3 | `package-lock.json` in sync                  | ✅ Fixed |
| 4 | Registry access available                    | ✅ Verified |
| 5 | `npm run build:frontend` succeeds            | ✅ Verified |
| 6 | `dist/index.html` and assets generated       | ✅ Verified |
| 7 | API routing strategy documented              | ✅ Relative `/api/` paths |
| 8 | No hardcoded backend URLs in frontend        | ✅ Verified |

---

## Action Items for Next Stories

1. **CB-002:** Run full `npm ci && npm run build:frontend` — now unblocked
2. **CB-003:** Configure `base` in `vite.config.js` if deploying under a subpath (e.g., `/callingbot/`)
3. **CB-025:** IIS must reverse-proxy `/api/*` to backend port for production
