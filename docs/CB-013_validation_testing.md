# CB-013: Validation Testing

## Summary
Automated validation script confirms the standalone EXE is a valid, functional Windows executable.

## Test Script
**File**: `scripts/validate-backend-exe.ps1`

## Test Results (10/10 Pass)
| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | EXE exists | PASS | 102.62 MB |
| 2 | Valid PE header | PASS | MZ magic bytes |
| 3 | x64 architecture | PASS | Machine: 0x8664 |
| 4 | EXE starts | PASS | Process starts successfully |
| 5 | Health endpoint | PASS | HTTP 200 within seconds |
| 6 | Health status=ok | PASS | JSON `{"status":"ok"}` |
| 7 | Uptime reported | PASS | uptimeSeconds field present |
| 8 | Auth endpoint | PASS | HTTP 401 (auth enforced) |
| 9 | Config endpoint | PASS | HTTP 401 (auth enforced) |
| 10 | Graceful shutdown | PASS | Process terminates cleanly |

## Usage
```powershell
npm run validate:backend

# Or with custom parameters
.\scripts\validate-backend-exe.ps1 -ExePath ".\release\CallingBot.exe" -Port 5099 -TimeoutSec 25
```

## Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| ExePath | `.\release\CallingBot.exe` | Path to the EXE |
| Port | 5099 | Port for validation server |
| TimeoutSec | 15 | Max seconds to wait for startup |
