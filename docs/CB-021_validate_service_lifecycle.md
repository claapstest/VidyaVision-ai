# CB-021: Validate Service Lifecycle and Logs

## Summary
Created an automated validation script that tests the full service lifecycle: registration, startup, health, graceful shutdown, crash recovery, and log output.

## Test Script
**File**: `scripts/validate-service-lifecycle.ps1`

## Test Suite (7 Tests)

| # | Test | What It Validates |
|---|------|------------------|
| 1 | Service registered | Windows SCM knows about "CallingBot" |
| 2 | Auto-start configured | StartType is Automatic or AutomaticDelayedStart |
| 3 | Recovery policy set | sc.exe qfailure shows RESTART actions |
| 4 | Service starts and serves HTTP | Start-Service succeeds, /health returns 200 |
| 5 | Graceful shutdown | Stop-Service completes within 35 seconds |
| 6 | Crash recovery | Kill CallingBot.exe process, verify service restarts and /health recovers |
| 7 | Logs written | .log files exist in the Logs directory |

## Usage
```powershell
# Run after install-service.ps1
.\scripts\validate-service-lifecycle.ps1 -InstallRoot "C:\CallingBot" -Port 5000 -TimeoutSec 30
```

## Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| InstallRoot | `C:\CallingBot` | Deployment root |
| Port | 5000 | Backend HTTP port |
| TimeoutSec | 30 | Max wait for startup |

## Log Rotation
WinSW handles log rotation via the `roll-by-size` mode:
- **Threshold**: 10 MB per log file
- **Retention**: 10 files (100 MB max per stream)
- **Files**: `CallingBot-service.out.log`, `CallingBot-service.err.log`
- **Location**: `C:\CallingBot\Logs\`

Logs are plain text and can be tailed with:
```powershell
Get-Content "C:\CallingBot\Logs\CallingBot-service.out.log" -Wait -Tail 50
```

## Troubleshooting
| Symptom | Check |
|---------|-------|
| Service won't start | `C:\CallingBot\Logs\CallingBot-service.err.log` |
| Health timeout | Is `CALLINGBOT_CONFIG` set? Is `callingbot.json` valid? |
| No crash recovery | `sc.exe qfailure CallingBot` — are restart actions set? |
| No logs | Is `C:\CallingBot\Logs\` writable by `NT SERVICE\CallingBot`? |
