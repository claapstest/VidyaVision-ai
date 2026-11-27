# CB-022: Define IIS Application Isolation and Path

## Summary
Defined and implemented the dedicated IIS hosting architecture for CallingBot (EPIC-05 / CB-022), providing complete application, process, and configuration isolation from any existing ASP.NET or legacy applications hosted on the same Windows Server.

---

## Deliverables
- **IIS Isolation Setup Script**: `scripts/setup-iis-isolation.ps1`
- **IIS Isolation Verification Script**: `scripts/verify-iis-isolation.ps1`
- **Hardened web.config**: `frontend/public/web.config` and `dist/web.config` (with `<validation validateIntegratedModeConfiguration="false" />`)
- **Architecture Documentation**: `docs/CB-022_iis_application_isolation_and_path.md`

---

## Acceptance Criteria Checklist

| Acceptance Criteria | Status | Implementation Details |
|---------------------|:------:|------------------------|
| **1. Agree dedicated CallingBot IIS application or site and URL path** | **PASSED** | Standardized URL virtual path `/callingbot` under `Default Web Site` (e.g., `https://server.domain.com/callingbot/`), with support for a dedicated standalone IIS site on custom port/hostname. |
| **2. Create/use a dedicated physical directory** | **PASSED** | Dedicated directory at `C:\inetpub\CallingBot\` (completely distinct from `C:\inetpub\wwwroot\`). |
| **3. Ensure configuration does not overwrite or modify existing ASP.NET application** | **PASSED** | Full isolation via dedicated AppPool (`CallingBotAppPool`, No Managed Code), isolated physical directory, independent `web.config`, and automated checks ensuring existing root files are untouched. |
| **4. Document application pool/path details** | **PASSED** | Complete configuration specifications, security boundaries, and instructions documented below. |

---

## Hosting Architecture & Isolation Model

### Why Isolation is Critical on Shared IIS Servers
In enterprise environments, client servers frequently host mission-critical legacy ASP.NET (.NET Framework 4.x or .NET Core) web applications in `C:\inetpub\wwwroot`. If CallingBot files were deployed into the root or shared an Application Pool:
1. **Config Overwrite**: CallingBot's `web.config` would overwrite the existing ASP.NET `web.config`.
2. **Inheritance Collisions**: Child applications inherit parent `<system.web>` and `<system.webServer>` handlers. If the parent app has custom authentication or unmanaged modules, a static React SPA could crash with `HTTP 500.19`.
3. **CLR Contention**: ASP.NET apps require .NET CLR runtime; CallingBot is a pure static React client that requires **No Managed Code**.

### Isolation Architecture Diagram

```
IIS Web Server
│
├── AppPool: ExistingAspNetAppPool (CLR v4.0 / .NET Core)
│   └── Site: "Default Web Site" (Root: /)
│       └── Physical: C:\inetpub\wwwroot\ (UNTOUCHED)
│           └── Existing ASP.NET web.config (UNTOUCHED)
│
└── AppPool: CallingBotAppPool (No Managed Code, Integrated Pipeline)
    └── Application: "Default Web Site/callingbot" (Virtual Path: /callingbot)
        └── Physical: C:\inetpub\CallingBot\ (DEDICATED)
            ├── index.html
            ├── assets/ (JS/CSS/SVG)
            ├── web.config (Isolated rewrite rules & MIME types)
            └── iis-isolation-manifest.json
```

---

## Application Pool Specifications

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Name** | `CallingBotAppPool` | Dedicated name avoiding collision with default pools. |
| **.NET CLR Version** | **No Managed Code** (`""`) | Static frontend contains only HTML, JS, CSS, and media. No .NET runtime overhead. |
| **Managed Pipeline Mode** | **Integrated** | Standard modern IIS processing pipeline. |
| **Start Mode** | **AlwaysRunning** | Prevents cold-start delays after idle periods. |
| **Idle Timeout (minutes)** | **0** (Disabled) | Application stays primed in IIS worker memory. |
| **Identity** | `ApplicationPoolIdentity` | Runs as `IIS AppPool\CallingBotAppPool` with least privilege. |

---

## IIS Deployment Options

### Option 1: Dedicated Sub-Application (Standard Default)
- **Parent Site**: `Default Web Site` (Port 80/443)
- **Virtual Path**: `/callingbot`
- **Application URL**: `https://<server-domain>/callingbot/`
- **Physical Directory**: `C:\inetpub\CallingBot\`
- **Application Pool**: `CallingBotAppPool`

### Option 2: Dedicated Standalone Site (Alternative for Dedicated Hostname/Port)
- **Site Name**: `CallingBotSite`
- **Bindings**: `http://*:8080` (or `https://callingbot.domain.com:443`)
- **Application URL**: `https://callingbot.domain.com/`
- **Physical Directory**: `C:\inetpub\CallingBot\`
- **Application Pool**: `CallingBotAppPool`

---

## Deployment & Verification Commands

### Step 1: Run Isolation Setup Script
Run in an elevated PowerShell terminal on the target IIS server:
```powershell
# Standard sub-application deployment (/callingbot)
powershell -ExecutionPolicy Bypass -File .\scripts\setup-iis-isolation.ps1 -PhysicalPath "C:\inetpub\CallingBot" -AppPath "/callingbot" -FrontendSource ".\dist"

# Or dedicated site deployment on port 8080
powershell -ExecutionPolicy Bypass -File .\scripts\setup-iis-isolation.ps1 -PhysicalPath "C:\inetpub\CallingBot" -DedicatedSite -Port 8080 -FrontendSource ".\dist"
```

### Step 2: Audit Isolation
Verify that the configuration is 100% isolated and the existing ASP.NET app was not modified:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-iis-isolation.ps1 -PhysicalPath "C:\inetpub\CallingBot"
```
