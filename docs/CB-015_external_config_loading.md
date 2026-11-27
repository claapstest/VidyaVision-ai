# CB-015: Implement External Config-File Loading

## Summary
Created a centralized config loader (`backend/config.js`) that supports loading configuration from an external JSON file via the `CALLINGBOT_CONFIG` environment variable, with fallback to `.env` for backward compatibility.

## What Changed
- **New file**: `backend/config.js` — config loader with validation and secret masking
- **Modified**: `backend/server.js` — replaced `dotenv.config()` with `loadConfig()`
- **Modified**: `backend/db.js` — replaced `dotenv.config()` with `loadConfig()`
- **Security fix**: Removed hardcoded JWT_SECRET fallback (`vidyavision-secure-jwt-key-2026`)

## How It Works
1. If `CALLINGBOT_CONFIG` env var is set → loads that JSON file
2. If not set → falls back to `.env` file (dotenv, same as before)
3. Validates all required fields exist and have correct types
4. Applies defaults for optional fields
5. Masks secrets (API keys, passwords, JWT) in startup log output

## Required Config Fields
| Field | Type | Description |
|-------|------|-------------|
| MSSQL_HOST | string | SQL Server hostname |
| MSSQL_DATABASE | string | Database name |
| JWT_SECRET | string | JWT signing secret (no more hardcoded fallback) |

## Optional Config Fields (with defaults)
| Field | Type | Default |
|-------|------|---------|
| PORT | number | 5000 |
| MSSQL_PORT | number | 1433 |
| MSSQL_USER | string | sa |
| MSSQL_PASSWORD | string | (empty) |
| MSSQL_ENCRYPT | boolean | false |
| MSSQL_TRUST_CERT | boolean | true |
| OMNIDIM_BASE_URL | string | https://backend.omnidim.io |
| OMNIDIM_API_KEY | string | (empty) |
| AGENT_ID | string | (empty) |
| UG_AGENT_ID | string | (empty) |
| PG_AGENT_ID | string | (empty) |
| ALLOWED_ORIGINS | string | (empty) |
| WEBHOOK_SECRET | string | (empty) |
| APP_API_KEY | string | (empty) |
| GOOGLE_SPREADSHEET_ID | string | (empty) |
| GOOGLE_SHEET_NAME | string | Sheet1 |
| GOOGLE_SERVICE_ACCOUNT_JSON | string | (empty) |
| NODE_ENV | string | production |
| LOG_LEVEL | string | info |
| DEBUG_SQL | boolean | false |
| WRITE_CACHE_FILE | boolean | false |

## Usage
```powershell
# Option 1: JSON config file (recommended for production)
$env:CALLINGBOT_CONFIG = "C:\CallingBot\config\callingbot.json"
.\CallingBot.exe

# Option 2: .env file (development, backward compatible)
# Just place .env in the working directory — no changes needed
node backend/server.js
```
