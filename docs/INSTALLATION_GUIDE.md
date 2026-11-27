# CallingBot Installation Guide

This guide walks the client infrastructure team through installing CallingBot on a Windows Server.

## Before You Begin

Ensure the following are ready:

- [ ] Windows Server 2019+ with IIS 10, URL Rewrite 2.1, and ARR 3.0
- [ ] SQL Server 2019+ with a database provisioned for CallingBot
- [ ] SSL certificate for the site hostname, bound to IIS on port 443
- [ ] OmniDimension API key and endpoint URL
- [ ] The CallingBot release package (`.zip` or folder)
- [ ] Administrator access on the target server

## Quick Install (5 Steps)

### Step 1 — Create the folder layout

```powershell
.\scripts\init-windows-layout.ps1
```

This creates `C:\CallingBot\` with Backend, Frontend, Config, Logs, and Service subdirectories.

### Step 2 — Copy files and configure

```powershell
# Backend
Copy-Item .\backend\CallingBot.exe C:\CallingBot\Backend\

# Configuration
Copy-Item .\config\callingbot.template.json C:\CallingBot\Config\callingbot.json
```

Open `C:\CallingBot\Config\callingbot.json` in a text editor and fill in your values:

- `MSSQL_HOST` — your SQL Server address
- `MSSQL_DATABASE` — the CallingBot database name
- `MSSQL_USER` / `MSSQL_PASSWORD` — SQL credentials
- `JWT_SECRET` — a random string of at least 32 characters
- `OMNIDIM_API_KEY` / `OMNIDIM_BASE_URL` — your OmniDimension credentials

Then lock down the config folder:
```powershell
.\scripts\set-config-acls.ps1
```

### Step 3 — Install the Windows service

```powershell
.\scripts\install-service.ps1
```

The service starts automatically on boot and restarts itself on failure.

### Step 4 — Deploy the frontend

```powershell
Expand-Archive .\frontend\vidyavision-frontend-*.zip -DestinationPath C:\CallingBot\Frontend\ -Force
```

### Step 5 — Configure IIS

```powershell
.\scripts\setup-iis-isolation.ps1
.\scripts\configure-iis-https-permissions.ps1
.\scripts\configure-iis-backend-routing.ps1
```

## Verify the Installation

```powershell
# Backend health
Invoke-WebRequest http://localhost:5000/health

# Full validation suite
.\scripts\validate-backend-exe.ps1
.\scripts\validate-service-lifecycle.ps1
.\scripts\validate-iis-spa-fallback.ps1
.\scripts\validate-iis-backend-routing.ps1
```

Open `https://<your-hostname>/` in a browser — you should see the CallingBot login page.

## Uninstall

```powershell
.\scripts\uninstall-service.ps1
# Then remove C:\CallingBot\ and the IIS site manually
```

## Support

For detailed troubleshooting and configuration reference, see `DEPLOYMENT_GUIDE.md` in the docs folder.
