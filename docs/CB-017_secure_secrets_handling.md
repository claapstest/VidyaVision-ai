# CB-017: Implement Secure Secrets Handling

## Summary
Implemented comprehensive secure secrets management for the CallingBot deployment (EPIC-03 / CB-017 / TC-012). Ensures secrets are never hardcoded in source code or release bundles, masked in logs and error traces, protected via Windows NTFS least-privilege Access Control Lists (ACLs), and verified through automated security tooling.

## Deliverables
- **NTFS ACL Lockdown Tool**: `scripts/set-config-acls.ps1`
- **NTFS ACL Verification Tool**: `scripts/verify-config-acls.ps1`
- **Automated Security Audit Suite**: `scripts/audit-secrets.js` (`npm run audit:secrets`)
- **Hardened Error & Masking Engine**: `backend/config.js`
- **Documentation & Architecture Guide**: `docs/CB-017_secure_secrets_handling.md`

---

## Acceptance Criteria Checklist

| Acceptance Criteria | Status | Implementation Details |
|---------------------|:------:|------------------------|
| **1. Ensure secrets are not hardcoded in EXE, frontend bundles or sample configuration** | **PASSED** | Automated scan (`npm run audit:secrets`) verified: zero secrets in `frontend/src/`, `dist/`, `dist-server/`, `config/callingbot.template.json`, and `.env.example`. Removed all hardcoded JWT fallbacks. |
| **2. Define runtime secret retrieval/protection approach approved by client** | **PASSED** | Defined decoupled runtime injection: secure external JSON configuration file loaded via `CALLINGBOT_CONFIG` or service-scoped environment variables. Enterprise integration paths (Windows DPAPI / Azure Key Vault) documented below. |
| **3. Apply/document least-privilege ACLs for configuration and secret material** | **PASSED** | Created `scripts/set-config-acls.ps1` and `scripts/verify-config-acls.ps1`. Disables inheritance and limits access strictly to `BUILTIN\Administrators` (F), `NT AUTHORITY\SYSTEM` (F), and the dedicated Windows Service account (R). Broad `Users` and `Everyone` permissions are removed. |
| **4. Verify logs do not expose credentials, tokens or connection strings** | **PASSED** | `maskSecret()` masks all sensitive values in console logs (`SU********45`). Error handling in `backend/config.js` never leaks raw secret values on type-validation failures. Database error handlers log sanitized messages without connection strings. |

---

## Secrets Architecture & Threat Model

### Sensitive Configuration Inventory
The following fields are classified as **Sensitive Secrets** within CallingBot:

| Secret Key | Description | Threat Mitigations |
|------------|-------------|-------------------|
| `JWT_SECRET` | Cryptographic secret for signing session JWTs | No default fallback; minimum 32 chars required; masked in logs; validated at boot. |
| `MSSQL_PASSWORD` | Database user password | Never in frontend; never printed in connection error logs; masked in startup dump. |
| `OMNIDIM_API_KEY` | Telephony provider Bearer token | Kept in backend process memory only; masked in logs; placeholder in templates. |
| `WEBHOOK_SECRET` | Inbound webhook HMAC signature validation key | Kept in backend process memory only; masked in logs. |
| `APP_API_KEY` | Internal REST API service key | Constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks; masked in logs. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional Google Cloud service account key | Masked in logs; externalized from repository. |

---

## Runtime Secret Protection Approaches

### Approach 1: External File with Windows NTFS ACLs (Recommended Default)
The production configuration file (`C:\CallingBot\config\callingbot.json`) resides outside the application source directory and is secured via Windows NTFS Access Control Lists (ACLs).

#### Permissions Matrix:
| Identity / Principal | Permissions | Rationale |
|----------------------|-------------|-----------|
| `NT AUTHORITY\SYSTEM` | Full Control (`F`) | Windows OS service manager execution. |
| `BUILTIN\Administrators` | Full Control (`F`) | Machine administrative management. |
| `NT SERVICE\CallingBot` (or dedicated service account) | Read Only (`R`) | Minimum privilege required to read configuration at startup. Cannot write, modify, or delete. |
| `BUILTIN\Users` / `Everyone` / `Authenticated Users` | **None (Removed)** | Prevents unprivileged local users or compromised non-admin services from viewing secrets. |

#### Applying NTFS ACLs:
Run the automated script in elevated PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\set-config-acls.ps1 -ConfigPath "C:\CallingBot\config\callingbot.json" -ServiceAccount "NT SERVICE\CallingBot"
```

#### Verifying NTFS ACLs:
Verify compliance against least-privilege standards:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-config-acls.ps1 -ConfigPath "C:\CallingBot\config\callingbot.json"
```

---

### Approach 2: Windows Service Environment Variables
For deployments where config files on disk are undesirable, the Windows Service wrapper (WinSW) or `sc.exe` injects secrets into the process environment block at service startup. The environment block is isolated to the service's session and not accessible to non-admin users.

Example WinSW configuration snippet:
```xml
<service>
  <id>CallingBot</id>
  <name>CallingBot Backend Service</name>
  <executable>C:\CallingBot\bin\CallingBot.exe</executable>
  <env name="CALLINGBOT_CONFIG" value="C:\CallingBot\config\callingbot.json" />
  <env name="JWT_SECRET" value="6f9b1c7a8e..." />
  <env name="MSSQL_PASSWORD" value="StrongP@ssw0rd!" />
</service>
```

---

### Approach 3: Enterprise Cloud Secret Stores (Optional Integration)
For organizations with central secret management:
- **Azure Key Vault**: The service wrapper or bootstrap PowerShell script queries Azure Key Vault using Managed Identity (or service principal) and outputs the decrypted config to a secured local memory-mapped file or temporary file with ACLs applied before launching `CallingBot.exe`.
- **Windows Credential Manager / DPAPI**: Secrets can be encrypted using `CryptProtectData` (Windows Data Protection API) bound to the service account's security identity.

---

## Automated Security Audit Tooling

Run the automated secrets scanner anytime:
```powershell
npm run audit:secrets
```

### Audit Coverage:
1. **Templates**: Verifies that every secret field in `callingbot.template.json` uses `<REPLACE_WITH_...>` syntax.
2. **Frontend Assets**: Scans `frontend/src` and `dist/` to verify zero backend connection strings, SQL passwords, or JWT secrets are included in client bundles.
3. **Backend Bundles**: Inspects `server.sea.js` to ensure dead fallback secrets (e.g. `vidyavision-secure-jwt-key-2026`) were completely eradicated.
4. **Log Masking**: Simulates realistic secret tokens and validates that stdout/stderr never reveal plaintext credentials.
