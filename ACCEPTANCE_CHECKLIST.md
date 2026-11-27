# CallingBot Acceptance Checklist

**Date:** 2026-11-27 15:53:20
**Result:** 24 passed, 0 failed, 0 warnings, 0 skipped

## Automated Checks

| Category | Check | Status | Detail |
|----------|-------|--------|--------|
| Frontend | dist/ directory exists | PASS |  |
| Frontend | index.html present | PASS |  |
| Frontend | JS bundles exist | PASS | 5 JS files |
| Frontend | Frontend ZIP packaged | PASS | vidyavision-frontend-v1.0.0-20261127.zip |
| Backend | CallingBot.exe exists | PASS | 102.6 MB |
| Backend | Valid PE header (MZ) | PASS |  |
| Backend | CJS bundle exists | PASS | dist-server/server.sea.js |
| Config | Template file exists | PASS |  |
| Config | Uses placeholder values (no real secrets) | PASS |  |
| Config | .env.example reference | PASS |  |
| Config | Config README | PASS |  |
| Security | Secret audit script exists | PASS | scripts/audit-secrets.js |
| Release | Release directory assembled | PASS | CallingBot-v1.0.0-20261127 |
| Release | RELEASE_NOTES.md present | PASS |  |
| Release | MANIFEST.txt present | PASS |  |
| Metadata | CHECKSUMS.sha256 present | PASS |  |
| Metadata | SBOM.json present | PASS |  |
| Metadata | TEST_SUMMARY.md present | PASS |  |
| Security | Security scan script exists | PASS |  |
| Security | Security scan report generated | PASS |  |
| Docs | Installation Guide | PASS |  |
| Docs | Deployment Guide | PASS |  |
| Docs | Service XML | PASS |  |
| Docs | Story documentation | PASS | 33 CB-* docs |

## Manual Checks (Require Live Server)

These checks require the application deployed on a Windows Server with IIS:

| # | Check | Script | Prerequisite |
|---|-------|--------|-------------|
| 1 | Windows service lifecycle | `validate-service-lifecycle.ps1` | Service installed |
| 2 | IIS SPA fallback routing | `validate-iis-spa-fallback.ps1` | IIS configured |
| 3 | IIS backend reverse proxy | `validate-iis-backend-routing.ps1` | ARR configured |
| 4 | IIS app pool isolation | `validate-existing-iis-isolation.ps1` | App pool created |
| 5 | HTTPS and permissions | `verify-iis-https-permissions.ps1` | SSL cert bound |
| 6 | SQL Server connectivity | `validate-integrations.js` | SQL Server accessible |
| 7 | OmniDimension API | `validate-integrations.js` | API key configured |
| 8 | Config ACLs locked down | `verify-config-acls.ps1` | ACLs applied |

## Handover Deliverables

- [ ] Release package (versioned directory with all artifacts)
- [ ] CHECKSUMS.sha256 for integrity verification
- [ ] SBOM.json for compliance and vulnerability tracking
- [ ] SECURITY_SCAN_REPORT.md with no FAIL findings
- [ ] INSTALLATION_GUIDE.md for client infrastructure team
- [ ] DEPLOYMENT_GUIDE.md for deployment engineer
- [ ] RELEASE_NOTES.md with version and deployment steps
- [ ] All validation scripts included in release
- [ ] Client infrastructure prerequisites confirmed (CB-033)

