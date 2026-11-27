# CallingBot Infrastructure Prerequisites Report

**Server:** Microsoft Windows 11 Home Single Language (AMD64)
**Date:** 2026-11-27 15:50:52
**Result:** 6 passed, 3 failed, 3 warnings, 4 info

> **Action Required:** 3 prerequisite(s) not met. See remediation steps below.

## Results

| Category | Check | Status | Detail |
|----------|-------|--------|--------|
| OS | Windows Server or Windows 10+ | PASS | Microsoft Windows 11 Home Single Language (Build 26300) |
| OS | x64 architecture | PASS | AMD64 |
| IIS | IIS Web Server installed | **FAIL** | Not found |
| IIS | URL Rewrite module | **FAIL** | Not found |
| IIS | Application Request Routing (ARR) | **FAIL** | Not found |
| Runtime | .NET Framework 4.7.2+ | PASS | Release 534296 |
| Network | Port 80 | INFO | Available |
| Network | Port 443 | INFO | Available |
| Network | Port 5000 available | PASS | Available |
| TLS | Valid SSL certificate | WARN | No valid certs with private key in LocalMachine\My |
| Resources | Disk space (C:) | PASS | 8.1 GB free |
| Resources | Available memory | WARN | 0.8 GB free of 7.8 GB |
| Database | SQL Server connectivity | INFO | Skipped (use -SqlServer to test) |
| Network | Outbound HTTPS | PASS | Status 200 |
| Permissions | Service account | INFO | NT SERVICE\CallingBot (virtual, created automatically) |
| Permissions | Running as administrator | WARN | No - some install steps require elevation |

## Remediation

- **IIS Web Server installed:** Install-WindowsFeature Web-Server -IncludeManagementTools
- **URL Rewrite module:** Download from https://www.iis.net/downloads/microsoft/url-rewrite
- **Application Request Routing (ARR):** Download from https://www.iis.net/downloads/microsoft/application-request-routing
- **Valid SSL certificate:** Import or request an SSL certificate for the site hostname
- **Available memory:** Minimum 2 GB available recommended
- **Running as administrator:** Run PowerShell as Administrator for deployment

## Full Prerequisites Checklist

- [ ] Windows Server 2019+ (x64)
- [ ] IIS 10 with URL Rewrite 2.1 and ARR 3.0
- [ ] .NET Framework 4.7.2+
- [ ] SSL certificate for site hostname, bound to port 443
- [ ] SQL Server 2019+ with database provisioned
- [ ] Ports 80/443 open inbound, port 5000 localhost only
- [ ] Outbound HTTPS allowed (for OmniDimension API)
- [ ] 500 MB disk space, 2 GB RAM available
- [ ] Administrator access for installation
- [ ] OmniDimension API key and endpoint URL

