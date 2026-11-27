# CB-033: Confirm Client Infrastructure Prerequisites

## Summary
Created an automated infrastructure prerequisites checker that validates 10 categories on the target server and produces a report with remediation steps for any failures.

## Script
**File**: `scripts/check-prerequisites.ps1`

## Checks Performed

| # | Category | Check | Requirement |
|---|----------|-------|-------------|
| 1 | OS | Windows version | Server 2019+ or Windows 10 1809+ |
| 2 | OS | Architecture | x64 (AMD64) |
| 3 | IIS | Web Server | IIS installed and enabled |
| 4 | IIS | URL Rewrite | Module installed |
| 5 | IIS | ARR | Application Request Routing installed |
| 6 | Runtime | .NET Framework | 4.7.2+ (for WinSW) |
| 7 | Network | Ports 80/443/5000 | Available or in expected use |
| 8 | TLS | SSL certificate | Valid cert with private key |
| 9 | Resources | Disk space | 500 MB+ free on C: |
| 10 | Resources | Memory | 2 GB+ available |
| 11 | Database | SQL Server | TCP connection on port 1433 |
| 12 | Network | Outbound HTTPS | External API access |
| 13 | Permissions | Administrator | Elevation check |

## Output
- Console: color-coded results per check
- File: `PREREQUISITES_REPORT.md` with results table, remediation steps, and full checklist

## Usage
```powershell
# Basic check (skips SQL connectivity test)
.\scripts\check-prerequisites.ps1

# With SQL Server connectivity test
.\scripts\check-prerequisites.ps1 -SqlServer "db.example.com"

# npm script
npm run check:prerequisites
```
