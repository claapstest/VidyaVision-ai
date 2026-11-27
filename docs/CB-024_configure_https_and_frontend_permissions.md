# CB-024: Configure HTTPS and Frontend Permissions

## 1. Overview & Objectives
**Story Reference**: `CB-024` (EPIC-05: IIS Hosting, Routing & Integration Validation)  
**Goal**: Configure approved TLS/HTTPS bindings, enforce secure HTTP response headers (HSTS, clickjacking and MIME sniffing protections), and establish least-privilege NTFS permissions on frontend assets ensuring strict isolation from backend secrets.

---

## 2. Security Architecture & Threat Model

```mermaid
flowchart TD
    subgraph Internet / Client Network
        Browser["Web Browser (HTTPS Client)"]
    end

    subgraph "IIS Web Server (Host)"
        Port443["Port 443 (TLS Binding / SNI)"]
        HSTS["HSTS & Security Headers"]
        AppPool["CallingBotAppPool (Identity: IIS AppPool\\CallingBotAppPool)"]
        PhysicalDir["C:\\inetpub\\CallingBot (Frontend Static Assets)"]
    end

    subgraph "CallingBot Backend Service (Isolated)"
        BackendCfg["C:\\CallingBot\\Config (callingbot.json)"]
        Service["CallingBot Windows Service (CallingBotSvc)"]
    end

    Browser -->|TLS 1.2 / 1.3 Port 443| Port443
    Port443 --> HSTS
    HSTS --> PhysicalDir
    AppPool -.->|Read & Execute ONLY| PhysicalDir
    AppPool x--x|DENIED (Least Privilege)| BackendCfg
    Service -->|Exclusive Access| BackendCfg
```

### Defense in Depth Principles:
1. **Least-Privilege Frontend Access**: `IIS AppPool\CallingBotAppPool` only requires `Read & Execute` (`(OI)(CI)(RX)`) on `C:\inetpub\CallingBot`. Write and Modify permissions are strictly denied to prevent malicious script injection or defacement via the web server process.
2. **Backend Secrets Isolation**: The IIS worker process has zero permissions to read `C:\CallingBot\Config` or `.env`. Even in the event of an IIS AppPool compromise, backend API keys, DB passwords, and OmniDimension secrets cannot be read.
3. **Transport Security (HSTS)**: `Strict-Transport-Security` enforces modern TLS and disallows HTTP downgrade attacks.

---

## 3. Configuration Details

### 3.1 HTTP Strict Transport Security (HSTS) and Headers (`web.config`)
In [frontend/public/web.config](file:///c:/Users/Sravanth.claaps/VidyaVision-ai%20-ob/frontend/public/web.config):
```xml
<httpProtocol>
  <customHeaders>
    <!-- Prevent MIME sniffing -->
    <add name="X-Content-Type-Options" value="nosniff" />
    <!-- Prevent Clickjacking / Framing -->
    <add name="X-Frame-Options" value="SAMEORIGIN" />
    <!-- Enable Cross-Site Scripting Filter -->
    <add name="X-XSS-Protection" value="1; mode=block" />
    <!-- HTTP Strict Transport Security (1 year) -->
    <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains" />
    <!-- Referrer Policy -->
    <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
  </customHeaders>
</httpProtocol>
```

### 3.2 HTTPS Redirection Rewrite Rule
```xml
<rule name="Redirect to HTTPS" enabled="false" stopProcessing="true">
  <match url=".*" />
  <conditions logicalGrouping="MatchAll">
    <add input="{HTTPS}" pattern="off" ignoreCase="true" />
    <!-- Bypasses localhost for developer testing -->
    <add input="{HTTP_HOST}" pattern="^localhost(:[0-9]+)?$" negate="true" />
    <add input="{HTTP_HOST}" pattern="^127\.0\.0\.1(:[0-9]+)?$" negate="true" />
  </conditions>
  <action type="Redirect" url="https://{HTTP_HOST}/{R:0}" redirectType="Permanent" />
</rule>
```

---

## 4. NTFS Permissions Matrix

| Identity | Path | Permissions | Purpose |
| :--- | :--- | :--- | :--- |
| `IIS AppPool\CallingBotAppPool` | `C:\inetpub\CallingBot` | `Read & Execute (RX)` | Serve static JS/HTML/CSS |
| `IIS AppPool\CallingBotAppPool` | `C:\inetpub\CallingBot` | `Write / Modify: DENIED` | Immutability protection |
| `IIS AppPool\CallingBotAppPool` | `C:\CallingBot\Config` | `NO ACCESS` | Protect backend secrets |
| `NT SERVICE\CallingBot` | `C:\CallingBot\Config` | `Read Only (R)` | Load runtime configurations |
| `Administrators` / `SYSTEM` | Both directories | `Full Control (F)` | Server administration |

---

## 5. Execution & Verification

### 5.1 Provisioning HTTPS and NTFS Permissions
Run the automated configuration script:
```powershell
npm run iis:https
```
Or with custom certificate thumbprint and hostname:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-iis-https-permissions.ps1 -CertThumbprint "THUMBPRINT_HEX" -HostName "callingbot.domain.com" -EnforceHttpsRedirect
```

### 5.2 Verification Suite
Run the 10-check audit suite:
```powershell
npm run iis:verify-https
```
Expected output:
```text
========================================================
  CallingBot HTTPS & Frontend Permissions Audit (CB-024)
========================================================

[1/3] Auditing Physical Directory and web.config Security...
  [PASS] Frontend Directory Exists - Path: C:\inetpub\CallingBot
  [PASS] Frontend web.config Exists & Valid - Path: C:\inetpub\CallingBot\web.config
  [PASS] HSTS Header Configured - Strict-Transport-Security: max-age=31536000; includeSubDomains
  [PASS] Content Protection Headers - nosniff, SAMEORIGIN, XSS-Protection present
  [PASS] HTTPS Redirection Rule Configured - Rule 'Redirect to HTTPS' defined in web.config

[2/3] Auditing NTFS Least-Privilege & Secrets Isolation...
  [PASS] Frontend Directory Read & Execute - AppPool identity granted Read & Execute on frontend files
  [PASS] Frontend Directory Write Immunity - AppPool identity does NOT have write permissions on static files
  [PASS] Backend Secrets Isolation - AppPool / IUSR has NO access to backend secrets (C:\CallingBot\Config)

[3/3] Auditing TLS Certificate & HTTPS Binding Schema...
  [PASS] TLS Certificate Availability - Certificate store / manifest: CN=CallingBot (...)
  [PASS] HTTPS Binding Schema (Manifest) - Target Port: 443, Status: Configured

========================================================
Audit Results: 10 Passed, 0 Failed
========================================================

[OK] CB-024 HTTPS & Frontend Permissions verified successfully!
```
