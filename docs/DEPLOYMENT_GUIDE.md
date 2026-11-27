# CallingBot Deployment Guide

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Windows Server | 2019 or later | x64 |
| IIS | 10.0+ | With URL Rewrite 2.1 and ARR 3.0 modules |
| .NET Framework | 4.7.2+ | For WinSW service wrapper |
| Disk space | 500 MB | For backend EXE, frontend, logs |
| RAM | 2 GB available | Backend process typical usage |
| Network | Ports 80/443 open inbound | Backend port 5000 localhost only |
| SQL Server | 2019 or later | With a database provisioned for CallingBot |
| SSL Certificate | Valid for the site hostname | Bound to IIS site on port 443 |

## Release Package Contents

```
CallingBot-v<version>-<date>/
  backend/CallingBot.exe        Standalone backend (Node.js SEA)
  frontend/*.zip                React/Vite production build
  service/CallingBot-service.xml WinSW service descriptor
  config/callingbot.template.json Configuration template
  config/.env.example           Environment variable reference
  scripts/                      Deployment and validation scripts
  docs/                         Implementation documentation
  RELEASE_NOTES.md              Version summary
  MANIFEST.txt                  File listing
  CHECKSUMS.sha256              SHA-256 hashes
  SBOM.json                     Software Bill of Materials
  TEST_SUMMARY.md               Build verification results
  SECURITY_SCAN_REPORT.md       Security scan results
```

## Step-by-Step Deployment

### 1. Verify Release Integrity

```powershell
# Compare checksums against CHECKSUMS.sha256
Get-Content .\CHECKSUMS.sha256 | ForEach-Object {
    if ($_ -match '^([a-f0-9]{64})\s+(.+)$') {
        $expected = $matches[1]
        $file = $matches[2]
        $actual = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
        if ($actual -eq $expected) { Write-Host "OK  $file" -ForegroundColor Green }
        else { Write-Host "MISMATCH  $file" -ForegroundColor Red }
    }
}
```

### 2. Create Folder Structure

```powershell
.\scripts\init-windows-layout.ps1
.\scripts\verify-windows-layout.ps1
```

Creates:
```
C:\CallingBot\
  Backend\       CallingBot.exe
  Frontend\      IIS site root
  Config\        callingbot.json (locked down)
  Logs\          Application logs
  Service\       WinSW files
```

### 3. Deploy Backend

```powershell
Copy-Item -Path .\backend\CallingBot.exe -Destination C:\CallingBot\Backend\CallingBot.exe
```

Optionally sign the EXE with an Authenticode certificate before copying:
```powershell
Set-AuthenticodeSignature -FilePath .\backend\CallingBot.exe -Certificate $cert
```

### 4. Configure Application

```powershell
Copy-Item -Path .\config\callingbot.template.json -Destination C:\CallingBot\Config\callingbot.json
```

Edit `C:\CallingBot\Config\callingbot.json` and replace all `<REPLACE_WITH_...>` placeholders:

| Setting | Description |
|---------|-------------|
| `MSSQL_HOST` | SQL Server hostname or IP |
| `MSSQL_DATABASE` | Database name |
| `MSSQL_USER` | SQL authentication user |
| `MSSQL_PASSWORD` | SQL authentication password |
| `JWT_SECRET` | Random string, minimum 32 characters |
| `OMNIDIM_API_KEY` | OmniDimension API key |
| `OMNIDIM_BASE_URL` | OmniDimension API endpoint |

Then lock down permissions:
```powershell
.\scripts\set-config-acls.ps1
.\scripts\verify-config-acls.ps1
```

### 5. Install Windows Service

```powershell
.\scripts\install-service.ps1
```

This downloads WinSW, registers the CallingBot service with:
- Automatic (Delayed Start) startup
- Recovery policy: restart at 10s / 30s / 60s, reset after 1 hour
- Service account: `NT SERVICE\CallingBot`
- Log rotation: 10 MB, 10 files

Verify:
```powershell
.\scripts\validate-service-lifecycle.ps1
```

### 6. Deploy Frontend to IIS

Extract the frontend ZIP to the IIS site root:
```powershell
Expand-Archive -Path .\frontend\vidyavision-frontend-*.zip -DestinationPath C:\CallingBot\Frontend\ -Force
```

### 7. Configure IIS

```powershell
# Set up app pool isolation
.\scripts\setup-iis-isolation.ps1

# Configure HTTPS and permissions
.\scripts\configure-iis-https-permissions.ps1

# Configure reverse proxy to backend
.\scripts\configure-iis-backend-routing.ps1
```

### 8. Validate Deployment

Run all validation scripts:
```powershell
.\scripts\validate-backend-exe.ps1
.\scripts\validate-service-lifecycle.ps1
.\scripts\validate-iis-spa-fallback.ps1
.\scripts\validate-iis-backend-routing.ps1
.\scripts\validate-existing-iis-isolation.ps1
.\scripts\run-security-scans.ps1
```

### 9. Connectivity Tests

```powershell
# SQL Server and OmniDimension API
node .\scripts\validate-integrations.js

# Or via PowerShell wrapper
.\scripts\validate-integrations.ps1
```

## Rollback Procedure

1. Stop the CallingBot service: `Stop-Service CallingBot`
2. Replace `C:\CallingBot\Backend\CallingBot.exe` with the previous version
3. Restore the previous `C:\CallingBot\Config\callingbot.json` if config changed
4. Restore the previous frontend files in `C:\CallingBot\Frontend\`
5. Start the service: `Start-Service CallingBot`
6. Verify health: `Invoke-WebRequest http://localhost:5000/health`

## Ports and Network

| Port | Protocol | Direction | Purpose |
|------|----------|-----------|---------|
| 443 | HTTPS | Inbound | IIS frontend (public) |
| 80 | HTTP | Inbound | Redirect to HTTPS |
| 5000 | HTTP | Localhost only | Backend API (via IIS reverse proxy) |
| 1433 | TCP | Outbound | SQL Server connection |

Port 5000 must NOT be exposed externally. IIS reverse-proxies `/api/*` to `http://localhost:5000`.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Service won't start | `Get-EventLog -LogName Application -Source CallingBot -Newest 10` |
| Health endpoint down | `Invoke-WebRequest http://localhost:5000/health` — check Logs folder |
| Frontend 404s | Verify URL Rewrite rule exists in IIS for SPA fallback |
| API returns 502 | Check backend service is running, check ARR proxy config |
| Config errors on start | Validate config: `node scripts\validate-config-template.js` |
| SQL connection fails | Test connectivity: `node scripts\validate-integrations.js` |
