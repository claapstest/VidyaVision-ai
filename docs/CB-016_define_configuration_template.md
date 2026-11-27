# CB-016: Define Configuration Template

## Summary
Created a non-secret, production-grade configuration template (`config/callingbot.template.json` and `release/config/callingbot.template.json`) covering environment, server port, SQL Server database endpoint, calling provider URL, and logging settings, along with detailed documentation and automated validation.

## Deliverables
- **Template file**: `config/callingbot.template.json`
- **Release artifact**: `release/config/callingbot.template.json`
- **Configuration guide**: `config/README.md`
- **Updated developer template**: `.env.example`
- **Automated validation script**: `scripts/validate-config-template.js`
- **NPM script**: `npm run validate:config`

---

## Acceptance Criteria Checklist
- [x] **Create a non-secret configuration template** covering environment (`NODE_ENV`), port (`PORT`), SQL endpoint/database (`MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_ENCRYPT`, `MSSQL_TRUST_CERT`), provider URL (`OMNIDIM_BASE_URL`), and logging (`LOG_LEVEL`, `DEBUG_SQL`).
- [x] **Document field names and expected formats** with complete field matrix, types, defaults, and usage.
- [x] **Use placeholders rather than real credentials or keys** using the standard `<REPLACE_WITH_...>` format.
- [x] **Validate template against application configuration loader** via `scripts/validate-config-template.js` and `backend/config.js`.

---

## Configuration Field Reference

| Field Name | Type | Category | Required | Default | Expected Format / Example | Description & Security Notes |
|------------|------|----------|----------|---------|---------------------------|------------------------------|
| `NODE_ENV` | `string` | Environment | No | `production` | `"production"` or `"development"` | Application runtime environment. |
| `PORT` | `number` | Server | Yes | `5000` | `5000` | Local TCP port for the backend HTTP/WebSocket server. |
| `ALLOWED_ORIGINS` | `string` | Security | No | `""` | `"https://callingbot.company.com"` | Comma-separated list of allowed CORS origins. |
| `MSSQL_HOST` | `string` | Database | **Yes** | — | `"sqlserver.internal.company.com"` | SQL Server hostname or IP address. |
| `MSSQL_PORT` | `number` | Database | No | `1433` | `1433` | SQL Server listening port. |
| `MSSQL_DATABASE` | `string` | Database | **Yes** | — | `"vidyavision"` | Database name. |
| `MSSQL_USER` | `string` | Database | No | `"sa"` | `"callingbot_svc"` | Dedicated least-privilege SQL service user. |
| `MSSQL_PASSWORD` | `string` | Database | No | `""` | `"<REPLACE_WITH_MSSQL_PASSWORD>"` | **Secret.** SQL user password. Masked in logs. |
| `MSSQL_ENCRYPT` | `boolean` | Database | No | `false` | `false` or `true` | Enable TLS encryption for SQL Server connection. |
| `MSSQL_TRUST_CERT` | `boolean` | Database | No | `true` | `true` or `false` | Trust server certificate (useful for internal CA or self-signed certs). |
| `OMNIDIM_BASE_URL` | `string` | Provider | No | `"https://backend.omnidim.io"` | `"https://backend.omnidim.io"` | Calling provider API base URL endpoint. |
| `OMNIDIM_API_KEY` | `string` | Provider | No | `""` | `"<REPLACE_WITH_OMNIDIM_API_KEY>"` | **Secret.** OmniDimension API bearer key. Masked in logs. |
| `AGENT_ID` | `string` | Provider | No | `""` | `"<REPLACE_WITH_DEFAULT_AGENT_ID>"` | Default telephony agent identifier. |
| `UG_AGENT_ID` | `string` | Provider | No | `""` | `"<REPLACE_WITH_UG_AGENT_ID>"` | Undergraduate telephony agent identifier. |
| `PG_AGENT_ID` | `string` | Provider | No | `""` | `"<REPLACE_WITH_PG_AGENT_ID>"` | Postgraduate telephony agent identifier. |
| `JWT_SECRET` | `string` | Security | **Yes** | — | `"<REPLACE_WITH_MIN_32_CHAR_SECRET>"` | **Secret.** Cryptographic signing secret for user session tokens (min 32 bytes). Masked in logs. |
| `WEBHOOK_SECRET` | `string` | Security | No | `""` | `"<REPLACE_WITH_WEBHOOK_SECRET>"` | **Secret.** Inbound webhook HMAC signature validation secret. Masked in logs. |
| `APP_API_KEY` | `string` | Security | No | `""` | `"<REPLACE_WITH_APP_API_KEY>"` | **Secret.** Internal API authorization key. Masked in logs. |
| `LOG_LEVEL` | `string` | Logging | No | `"info"` | `"info"`, `"debug"`, `"warn"`, `"error"` | Application console logging verbosity level. |
| `DEBUG_SQL` | `boolean` | Logging | No | `false` | `false` or `true` | Output verbose SQL queries to stdout for troubleshooting. |
| `GOOGLE_SPREADSHEET_ID` | `string` | Integration | No | `""` | `"<OPTIONAL_ID>"` | Optional Google Sheets spreadsheet identifier. |
| `GOOGLE_SHEET_NAME` | `string` | Integration | No | `"Sheet1"` | `"Sheet1"` | Optional Google Sheets worksheet name. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `string` | Integration | No | `""` | `"<OPTIONAL_JSON>"` | **Secret.** Base64 or JSON string of service account credentials. |
| `WRITE_CACHE_FILE` | `boolean` | Diagnostics | No | `false` | `false` or `true` | Persist fallback cache files to local disk. |

---

## Template JSON Content

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "_comment": "CallingBot Deployment Configuration Template (CB-016). Replace placeholders before deployment.",
  "NODE_ENV": "production",
  "PORT": 5000,
  "ALLOWED_ORIGINS": "https://callingbot.internal.example.com",

  "MSSQL_HOST": "sqlserver.internal.example.com",
  "MSSQL_PORT": 1433,
  "MSSQL_DATABASE": "vidyavision",
  "MSSQL_USER": "callingbot_svc",
  "MSSQL_PASSWORD": "<REPLACE_WITH_MSSQL_PASSWORD>",
  "MSSQL_ENCRYPT": false,
  "MSSQL_TRUST_CERT": true,

  "OMNIDIM_BASE_URL": "https://backend.omnidim.io",
  "OMNIDIM_API_KEY": "<REPLACE_WITH_OMNIDIM_API_KEY>",
  "AGENT_ID": "<REPLACE_WITH_DEFAULT_AGENT_ID>",
  "UG_AGENT_ID": "<REPLACE_WITH_UG_AGENT_ID>",
  "PG_AGENT_ID": "<REPLACE_WITH_PG_AGENT_ID>",

  "JWT_SECRET": "<REPLACE_WITH_SECURE_RANDOM_SECRET_AT_LEAST_32_CHARS>",
  "WEBHOOK_SECRET": "<REPLACE_WITH_WEBHOOK_SECRET>",
  "APP_API_KEY": "<REPLACE_WITH_APP_API_KEY>",

  "LOG_LEVEL": "info",
  "DEBUG_SQL": false,

  "GOOGLE_SPREADSHEET_ID": "<OPTIONAL_SPREADSHEET_ID_OR_EMPTY>",
  "GOOGLE_SHEET_NAME": "Sheet1",
  "GOOGLE_SERVICE_ACCOUNT_JSON": "<OPTIONAL_SERVICE_ACCOUNT_JSON_OR_EMPTY>",
  "WRITE_CACHE_FILE": false
}
```

---

## Deployment & Usage Instructions

### 1. Copy Template to Destination
On the Windows deployment server, create the configuration folder and copy the template:
```powershell
New-Item -ItemType Directory -Force -Path "C:\CallingBot\config"
Copy-Item .\config\callingbot.template.json C:\CallingBot\config\callingbot.json
```

### 2. Generate Cryptographic Secret
Generate a cryptographically secure 256-bit token for `JWT_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Replace Placeholders in `callingbot.json`
Populate actual infrastructure hostnames, ports, and database credentials in `C:\CallingBot\config\callingbot.json`.

### 4. Configure Environment Variable or Service Wrapper
Set the system environment variable:
```powershell
[System.Environment]::SetEnvironmentVariable("CALLINGBOT_CONFIG", "C:\CallingBot\config\callingbot.json", [System.EnvironmentVariableTarget]::Machine)
```

### 5. Validate Configuration
Run the automated validation check:
```powershell
npm run validate:config
```
