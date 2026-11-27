# CB-023: Configure IIS Static Content and SPA Fallback

## Summary
Configured and validated Microsoft IIS static content hosting and client-side single page application (SPA) routing fallback for CallingBot (EPIC-05 / CB-023 / TC-014). Ensures default document resolution (`index.html`), modern web asset MIME type mappings, seamless browser navigation and page refresh across client-side routes (`/login`, `/dashboard`, etc.), and strict bypass for backend `/api/*` endpoints.

---

## Deliverables
- **Hardened Configuration**: `frontend/public/web.config` and `dist/web.config`
- **IIS Feature Setup Script**: `scripts/configure-iis-features.ps1`
- **SPA Fallback Verification Suite**: `scripts/validate-iis-spa-fallback.ps1` (TC-014)
- **Technical Documentation**: `docs/CB-023_iis_static_content_and_spa_fallback.md`

---

## Acceptance Criteria Checklist

| Acceptance Criteria | Status | Implementation Details |
|---------------------|:------:|------------------------|
| **1. Enable IIS Static Content feature** | **PASSED** | Automated feature verification via `scripts/configure-iis-features.ps1` (`Web-Static-Content`, `Web-Default-Doc`, `Web-Http-Errors`). MIME types registered for `.json`, `.woff`, `.woff2`, `.svg`, `.webp`, and `.webmanifest`. |
| **2. Set index.html as default document** | **PASSED** | `<defaultDocument>` configured with `<clear />` and `<add value="index.html" />` to resolve directory root requests to `index.html`. |
| **3. Configure URL Rewrite SPA fallback when required** | **PASSED** | Configured URL Rewrite 2.1 rule rewriting all non-file, non-directory requests to `index.html`. Uses regex condition `(^\|/)api/` to ensure backend REST/WebSocket requests are never rewritten. |
| **4. Verify browser navigation/refresh for frontend routes** | **PASSED** | Validated via `scripts/validate-iis-spa-fallback.ps1` across root, virtual routes (`/login`, `/dashboard`, `/campaigns`), and API bypass. |

---

## Technical Architecture

### 1. The Single Page Application (SPA) Routing Challenge on IIS
In standard web servers, navigating to `https://server.domain.com/callingbot/dashboard` looks for a physical directory named `dashboard` with an `index.html` inside it. In a React Single Page Application:
- Physical files exist **only** for `index.html` and bundled assets in `/assets/`.
- Virtual routes like `/dashboard`, `/login`, or `/campaigns` are handled entirely inside the browser by React Router.
- Without URL Rewrite, refreshing the browser on `/dashboard` returns **HTTP 404 (Not Found)**.

### 2. URL Rewrite Fallback Rule
CallingBot resolves this using the Microsoft IIS URL Rewrite 2.1 module in `web.config`:

```xml
<rewrite>
  <rules>
    <rule name="SPA Fallback" stopProcessing="true">
      <match url=".*" />
      <conditions logicalGrouping="MatchAll">
        <!-- Do not rewrite if the request matches an existing file on disk -->
        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
        <!-- Do not rewrite if the request matches an existing directory on disk -->
        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
        <!-- Do not rewrite backend API requests (supports both root and subpath deployments) -->
        <add input="{REQUEST_URI}" pattern="(^|/)api/" negate="true" />
      </conditions>
      <action type="Rewrite" url="index.html" />
    </rule>
  </rules>
</rewrite>
```

---

## MIME Type Reference Matrix

IIS blocks unmapped file extensions by default. `web.config` explicitly registers:

| Extension | MIME Type | Purpose |
|-----------|-----------|---------|
| `.json` | `application/json` | Manifests, application data |
| `.svg` | `image/svg+xml` | Logos, Lucide icons, graphics |
| `.woff` | `font/woff` | Web fonts |
| `.woff2` | `font/woff2` | Modern compressed web fonts |
| `.webp` | `image/webp` | Next-generation image formats |
| `.webmanifest` | `application/manifest+json` | PWA / browser web app manifests |

---

## Automated Verification & Operational Commands

### Check & Enable IIS Features
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-iis-features.ps1
```

### Validate Static Configuration (TC-014)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-iis-spa-fallback.ps1 -WebConfigPath ".\dist\web.config"
```

### Validate Live IIS Endpoints (Post-Deployment)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-iis-spa-fallback.ps1 -BaseUrl "https://client-server.com/callingbot"
```
