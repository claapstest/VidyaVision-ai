# CB-019: Prepare Windows Service Wrapper Configuration

## Summary
Configured WinSW (Windows Service Wrapper) to run CallingBot.exe as a managed Windows service with proper executable path, working directory, environment variables, and log routing.

## Deliverables
- `service/CallingBot-service.xml` — WinSW service descriptor
- `scripts/install-service.ps1` — Automated service installer
- `scripts/uninstall-service.ps1` — Service uninstaller

## WinSW Configuration

### Service Identity
| Field | Value |
|-------|-------|
| Service ID | `CallingBot` |
| Display Name | `CallingBot Backend` |
| Executable | `C:\CallingBot\Backend\CallingBot.exe` |
| Working Directory | `C:\CallingBot\Backend` |

### Environment Variables
| Variable | Value |
|----------|-------|
| `CALLINGBOT_CONFIG` | `C:\CallingBot\Config\callingbot.json` |
| `NODE_ENV` | `production` |

### Logging
- Mode: Roll by size (10 MB per file, 10 files retained)
- Location: `C:\CallingBot\Logs\`
- Files: `CallingBot-service.out.log` (stdout), `CallingBot-service.err.log` (stderr)

### Startup
- Type: Automatic (Delayed Start)
- Stop timeout: 30 seconds

## Deployment Layout
```
C:\CallingBot\
  ├── Backend\          ← CallingBot.exe
  ├── Config\           ← callingbot.json
  ├── Logs\             ← stdout/stderr logs (auto-rotated)
  └── Service\          ← CallingBot-service.exe + CallingBot-service.xml
```

## WinSW Version
Using WinSW v3.0.0-alpha.11 (x64). The installer downloads it automatically or accepts a local path via `-WinSWPath`.

## Installation
```powershell
# Full install with auto-start
.\scripts\install-service.ps1 -InstallRoot "C:\CallingBot" -StartAfterInstall

# Uninstall
.\scripts\uninstall-service.ps1 -InstallRoot "C:\CallingBot"
```
