# CallingBot Installation Guide

This guide walks the client infrastructure team through installing CallingBot on a Windows Server.

## Before You Begin: Check Prerequisites

Run the automated prerequisites check from an elevated Administrator PowerShell prompt:

```powershell
cd C:\Staging\CallingBot\scripts
.\check-prerequisites.ps1
```

Ensure the following prerequisites are met:

- [ ] Windows Server 2019+ (x64) with IIS 10, URL Rewrite 2.1, and ARR 3.0
- [ ] SQL Server 2019+ with database `vidyavision` provisioned
- [ ] SSL certificate for the site hostname, bound to IIS on port 443
- [ ] OmniDimension API key and endpoint URL
- [ ] Administrator access on the target server

---

## Quick Install (5 Steps)

Open PowerShell as **Administrator** in the extracted release directory:

### Step 1 — Create standard folder layout

```powershell
cd .\scripts
.\init-windows-layout.ps1
```

This creates `C:\CallingBot\` with `Backend\`, `Config\`, `Logs\`, and `Service\` subdirectories.

### Step 2 — Copy files and configure application

```powershell
# Copy backend executable
Copy-Item ..\backend\CallingBot.exe C:\CallingBot\Backend\CallingBot.exe

# Copy configuration template
Copy-Item ..\config\callingbot.template.json C:\CallingBot\Config\callingbot.json
```

Open `C:\CallingBot\Config\callingbot.json` in a text editor and fill in your environment values:

- `MSSQL_HOST` — your SQL Server address / hostname
- `MSSQL_DATABASE` — `vidyavision` (or your database name)
- `MSSQL_USER` / `MSSQL_PASSWORD` — SQL service account credentials
- `JWT_SECRET` — a random string of at least 32 characters
- `OMNIDIM_API_KEY` / `OMNIDIM_BASE_URL` — your OmniDimension credentials

Then lock down the config file permissions (least privilege NTFS ACLs):

```powershell
.\set-config-acls.ps1 -ConfigPath "C:\CallingBot\Config\callingbot.json"
.\verify-config-acls.ps1 -ConfigPath "C:\CallingBot\Config\callingbot.json"
```

### Step 3 — Install the Windows service

```powershell
.\install-service.ps1
```

The service runs as `NT SERVICE\CallingBot`, starts automatically on boot, and auto-restarts on failure.

### Step 4 — Provision IIS frontend & isolation

```powershell
# Deploys frontend to dedicated physical directory (C:\inetpub\CallingBot) and binds to /callingbot
$frontendZip = (Get-ChildItem ..\frontend\vidyavision-frontend-*.zip).FullName
.\setup-iis-isolation.ps1 -PhysicalPath "C:\inetpub\CallingBot" -AppPath "/callingbot" -FrontendSource $frontendZip
```

### Step 5 — Configure HTTPS, permissions & backend routing

```powershell
# Configure ARR reverse proxy to backend private port (5000)
.\configure-iis-backend-routing.ps1 -PhysicalPath "C:\inetpub\CallingBot"

# Configure HTTPS binding and least-privilege AppPool read permissions
.\configure-iis-https-permissions.ps1 -PhysicalPath "C:\inetpub\CallingBot"
```

---

## Verify the Installation

Run the master automated acceptance checklist (24 automated tests):

```powershell
.\run-acceptance-checklist.ps1 -SkipBuild
```

Expected result: **24 Passed, 0 Failed**.

You can also run specific component tests:

```powershell
# 1. Test service lifecycle (start/stop/restart)
.\validate-service-lifecycle.ps1

# 2. Test IIS SPA fallback routing
.\validate-iis-spa-fallback.ps1

# 3. Test reverse proxy routing & private port isolation
.\validate-iis-backend-routing.ps1

# 4. Confirm zero impact on existing ASP.NET application
.\validate-existing-iis-isolation.ps1

# 5. Test SQL Server and OmniDimension connectivity
.\validate-integrations.ps1
```

Open `https://<your-hostname>/callingbot` in a browser — you should see the CallingBot login page.

---

## Uninstall

To cleanly remove CallingBot:

```powershell
.\scripts\uninstall-service.ps1
# Then remove C:\CallingBot\ and C:\inetpub\CallingBot\ manually
```

## Support

For detailed troubleshooting, network tables, and configuration reference, see `DEPLOYMENT_GUIDE.md` in the docs folder.
