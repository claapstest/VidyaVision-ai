# CB-030: Run Security Scans

## Summary
Created a comprehensive security scan suite that runs six checks and produces a consolidated SECURITY_SCAN_REPORT.md with findings and recommendations.

## Script
**File**: `scripts/run-security-scans.ps1`

## Scans Performed

| # | Scan | What It Checks |
|---|------|----------------|
| 1 | Dependency Audit | `npm audit` for known CVEs in production and dev dependencies |
| 2 | Secret Scan | Hardcoded passwords, API keys, private keys, AWS credentials, connection strings in source |
| 3 | EXE Signature | Authenticode signature status on CallingBot.exe |
| 4 | Config ACLs | Whether `C:\CallingBot\Config` has overly permissive access (Everyone/Users with write) |
| 5 | Firewall Rules | Inbound rules on ports 80, 443, 5000 — flags if 5000 is externally exposed |
| 6 | Release Artifacts | Re-scans all text files in the release package for leaked secrets |

## Output
- Console: color-coded PASS/FAIL/WARN per scan
- File: `SECURITY_SCAN_REPORT.md` with summary table, detailed findings, and recommendations

## Exclusions
The secret scanner skips:
- Binary files (.exe, .zip, .dll)
- Known false positives: `audit-secrets.js`, `.env.example`, `validate-backend-exe.ps1`, `validate-integrations.js`, `run-security-scans.ps1`
- Directories: `node_modules`, `.git`, `dist`, `dist-server`, `release`
- Values containing placeholder markers (`<REPLACE_WITH_`, `CHANGE_ME`, `placeholder`)

## Usage
```powershell
# Run all scans
.\scripts\run-security-scans.ps1

# Scan a specific release directory
.\scripts\run-security-scans.ps1 -ReleaseDir ".\release\CallingBot-v1.0.0-20261127"

# npm script
npm run security:scan
```

## Recommendations (from report)
1. Sign the EXE with an Authenticode certificate before production
2. Lock down port 5000 — backend only via IIS reverse proxy (localhost)
3. Run `npm audit fix` if vulnerabilities are reported
4. Apply config ACLs on the target server
5. Ensure only ports 80/443 are externally exposed
6. Enable WDAC in audit mode
