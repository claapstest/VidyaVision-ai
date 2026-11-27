# CallingBot Security Scan Report

**Date:** 2026-11-27 15:53:13
**Scanner:** run-security-scans.ps1 (CB-030)
**Result:** 3 passed, 0 failed, 3 warnings

## Summary

| # | Category | Status | Finding |
|---|----------|--------|---------|
| 1 | Dependency Audit | WARN | 8 vulnerabilities (no critical/high) |
| 2 | Secret Scan | PASS | No hardcoded secrets detected |
| 3 | EXE Signature | WARN | EXE is not signed |
| 4 | Config ACLs | WARN | Config directory not found at C:\CallingBot\Config |
| 5 | Firewall Rules | PASS | Firewall rules reviewed |
| 6 | Release Artifacts | PASS | No secrets in release package |

## Detailed Findings

### Dependency Audit

**Status:** WARN
**Summary:** 8 vulnerabilities (no critical/high)

```
Critical: 0, High: 0, Moderate: 8, Low: 0
```

### Secret Scan

**Status:** PASS
**Summary:** No hardcoded secrets detected

```
Scanned 105 source files
```

### EXE Signature

**Status:** WARN
**Summary:** EXE is not signed

```
Sign with an Authenticode certificate before production deployment
```

### Config ACLs

**Status:** WARN
**Summary:** Config directory not found at C:\CallingBot\Config

```
Run init-windows-layout.ps1 and set-config-acls.ps1 on the target server
```

### Firewall Rules

**Status:** PASS
**Summary:** Firewall rules reviewed

```
Port 5000: Unable to query firewall (requires elevation)
Port 443: Unable to query firewall (requires elevation)
Port 80: Unable to query firewall (requires elevation)
```

### Release Artifacts

**Status:** PASS
**Summary:** No secrets in release package

```
Scanned 62 release files
```

## Recommendations

1. **Sign the EXE** with an Authenticode certificate before production deployment
2. **Lock down port 5000** - backend should only be accessible via IIS reverse proxy (localhost)
3. **Run `npm audit fix`** if any vulnerabilities are reported above
4. **Apply config ACLs** with `set-config-acls.ps1` on the target server
5. **Review firewall rules** to ensure only ports 80/443 are externally exposed
6. **Enable Windows Defender Application Control** (WDAC) in audit mode

