# CallingBot Production Handover

## Project Overview

CallingBot is a VidyaVision calling platform with a Node.js backend (packaged as a standalone Windows EXE) and a React/Vite frontend (served via IIS). This document summarizes everything delivered for production deployment.

## What Was Built (6 Epics, 33 Stories)

### EPIC-01: Frontend Production Build and IIS Packaging
- Vite production build with optimized chunks
- Frontend packaged as a deployable ZIP
- IIS SPA fallback configuration

### EPIC-02: Backend Standalone Windows EXE
- esbuild bundles 1,674 modules into a single file
- ESM-to-CJS conversion for Node.js SEA compatibility
- Standalone CallingBot.exe (~102 MB) — no Node.js install required

### EPIC-03: External Configuration, Secrets, and Windows Layout
- JSON config file with placeholder templates (no hardcoded secrets)
- Environment variable override support
- Windows folder layout (`C:\CallingBot\`) with locked-down ACLs
- Secret masking in all log output

### EPIC-04: Windows Service Wrapper
- WinSW service descriptor with auto-start and recovery policy
- Service account: `NT SERVICE\CallingBot` (least-privilege)
- Install/uninstall scripts and lifecycle validation

### EPIC-05: IIS Frontend and Connectivity Validation
- IIS app pool isolation, HTTPS configuration, URL Rewrite
- Reverse proxy from IIS to backend on localhost:5000
- SQL Server and OmniDimension API connectivity validation

### EPIC-06: Release Packaging, Security, and Handover
- Versioned release assembly with manifest and release notes
- SHA-256 checksums, CycloneDX SBOM, test summary
- Security scan suite (dependencies, secrets, ACLs, firewall, signature)
- Deployment guide, installation guide, acceptance checklist

## Deliverables

| Deliverable | Location |
|-------------|----------|
| Release package | `release/CallingBot-v<version>-<date>/` |
| Installation guide | `docs/INSTALLATION_GUIDE.md` |
| Deployment guide | `docs/DEPLOYMENT_GUIDE.md` |
| Acceptance checklist | Run `scripts/run-acceptance-checklist.ps1` |
| Security scan report | Run `scripts/run-security-scans.ps1` |
| All story docs (33) | `docs/CB-*.md` |

## npm Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run build:frontend` | Build frontend for production |
| `npm run build:backend:all` | Bundle, convert, and package backend EXE |
| `npm run release:assemble` | Assemble versioned release directory |
| `npm run release:metadata` | Generate checksums, SBOM, test summary |
| `npm run security:scan` | Run all security scans |
| `npm run validate:backend` | Validate backend EXE (10 tests) |
| `npm run validate:service` | Validate Windows service lifecycle |
| `npm run validate:spa` | Validate IIS SPA routing |
| `npm run validate:routing` | Validate IIS reverse proxy |
| `npm run validate:isolation` | Validate IIS app pool isolation |
| `npm run validate:integrations` | Test SQL and API connectivity |
| `npm run validate:config` | Validate config template |
| `npm run audit:secrets` | Run source code secret scan |

## Known Limitations

1. **CallingBot.exe is unsigned** — sign with an Authenticode certificate before production
2. **Port 5000 must be localhost-only** — ensure firewall blocks external access
3. **IIS validation requires IIS role enabled** with URL Rewrite and ARR modules
4. **Service lifecycle tests require the service installed** on a Windows Server
5. **Integration tests require live SQL Server and API access** with real credentials

## Contacts and Ownership

| Role | Responsibility |
|------|---------------|
| Development team | Source code, build pipeline, bug fixes |
| Infrastructure team | Server provisioning, IIS, SSL, firewall |
| DBA | SQL Server database, credentials, backups |
| Security team | Code signing, vulnerability remediation, compliance |
