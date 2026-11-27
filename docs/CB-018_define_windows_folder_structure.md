# CB-018: Define Windows Folder Structure

## Summary
Defined and implemented the standardized Windows Server application folder layout for CallingBot (EPIC-03 / CB-018). Established the four primary directories—`Backend`, `Config`, `Logs`, and `Service`—with least-privilege NTFS Access Control Lists (ACLs), automated layout provisioning, and path resolution in the backend configuration loader.

---

## Deliverables
- **Layout Provisioning Script**: `scripts/init-windows-layout.ps1`
- **Layout Verification Script**: `scripts/verify-windows-layout.ps1`
- **Auto-Discovery Path Resolution**: `backend/config.js` (detects `Config/callingbot.json` across standard Windows folder structures)
- **Architecture Documentation**: `docs/CB-018_define_windows_folder_structure.md`

---

## Acceptance Criteria Checklist

| Acceptance Criteria | Status | Implementation Details |
|---------------------|:------:|------------------------|
| **1. Define the agreed application folder layout for Backend, Config, Logs and Service files** | **PASSED** | Standardized root structure `C:\CallingBot\` with four dedicated directories: `Backend\`, `Config\`, `Logs\`, and `Service\`. |
| **2. Document file placement and ownership/permissions** | **PASSED** | Fully mapped each directory's file placement, security boundaries, and least-privilege NTFS ACL matrix. |
| **3. Confirm paths are compatible with service configuration and config loader** | **PASSED** | Hardened `backend/config.js` with auto-discovery for `../Config/callingbot.json` and `./Config/callingbot.json`, fully compatible with WinSW service working directories. |
| **4. Provide layout instructions to deployment team** | **PASSED** | Automated one-step deployment script `scripts/init-windows-layout.ps1` with manual copy-paste instructions documented below. |

---

## Standard Windows Folder Hierarchy

The standardized deployment root directory is `C:\CallingBot\`:

```
C:\CallingBot\
│
├── Backend\                      # Application Executables & Binaries
│   ├── CallingBot.exe            # Compiled standalone Windows x64 executable (SEA)
│   └── (Optional native addons)
│
├── Config\                       # Configuration Files & Secrets (Protected)
│   ├── callingbot.json           # Production JSON config file (ACL-restricted)
│   └── callingbot.template.json  # Reference configuration template
│
├── Logs\                         # Application & Service Output Logs
│   ├── CallingBot.out.log        # WinSW standard output capture
│   ├── CallingBot.err.log        # WinSW standard error capture
│   └── (Rotated app log files)
│
├── Service\                      # Windows Service Wrapper & Control Scripts
│   ├── CallingBot.xml            # WinSW XML service definition (EPIC-04 / CB-019)
│   ├── CallingBotService.exe     # WinSW service wrapper host
│   ├── install-service.ps1       # Automated service registration script
│   └── uninstall-service.ps1     # Automated service unregistration script
│
└── layout-manifest.json          # Deployment validation metadata & timestamp
```

---

## Folder Placement & Permissions Matrix

Each directory enforces least-privilege NTFS Access Control Lists:

| Directory | Primary Contents | Service Account Rights | Administrators / SYSTEM | Standard Users | Rationale |
|-----------|------------------|------------------------|-------------------------|----------------|-----------|
| **`C:\CallingBot\`** | Root container | Read & Execute (`RX`) | Full Control (`F`) | None | Prevents unprivileged file creation or modification in root. |
| **`\Backend\`** | `CallingBot.exe` | Read & Execute (`RX`) | Full Control (`F`) | None | Service only needs execution rights; cannot modify binaries. |
| **`\Config\`** | `callingbot.json` | **Read Only (`R`)** | Full Control (`F`) | None | **Strict secret protection.** Service cannot tamper with or overwrite config. Inheritance is blocked. |
| **`\Logs\`** | `*.log` files | **Modify / Write (`M`)** | Full Control (`F`) | None | Service host must be able to create, append, and rotate log files. |
| **`\Service\`** | `CallingBot.xml`, WinSW | Read & Execute (`RX`) | Full Control (`F`) | None | Controls service lifecycle; non-admin users cannot alter service definitions. |

---

## Path Resolution & Compatibility

### Configuration Auto-Discovery
`backend/config.js` resolves configuration paths through the following priority order:
1. **Explicit Environment Variable**: `process.env.CALLINGBOT_CONFIG` (highest priority).
2. **Standard Windows Layout (Parent Directory)**: `resolve(process.cwd(), '..', 'Config', 'callingbot.json')` — when the Windows Service runs with `WorkingDirectory = C:\CallingBot\Backend`.
3. **Standard Windows Layout (Current Directory)**: `resolve(process.cwd(), 'Config', 'callingbot.json')` — when the Windows Service runs with `WorkingDirectory = C:\CallingBot`.
4. **Development Fallback**: `.env` file via `dotenv`.

This guarantees that whether CallingBot is run manually from PowerShell or launched by WinSW as a Windows Service, the configuration file is located seamlessly.

---

## Deployment Team Instructions

### Option A: Automated Provisioning (Recommended)
Run the automated layout script from an elevated PowerShell terminal:
```powershell
# Create folder structure and copy release artifacts
powershell -ExecutionPolicy Bypass -File .\scripts\init-windows-layout.ps1 -InstallRoot "C:\CallingBot" -ServiceAccount "NT SERVICE\CallingBot" -CopyArtifacts
```

Verify compliance against standards:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-windows-layout.ps1 -InstallRoot "C:\CallingBot"
```

### Option B: Manual Setup Procedure
If deploying manually without the script:

1. **Create directories**:
   ```powershell
   New-Item -ItemType Directory -Force -Path "C:\CallingBot\Backend"
   New-Item -ItemType Directory -Force -Path "C:\CallingBot\Config"
   New-Item -ItemType Directory -Force -Path "C:\CallingBot\Logs"
   New-Item -ItemType Directory -Force -Path "C:\CallingBot\Service"
   ```

2. **Copy files**:
   - Copy `CallingBot.exe` to `C:\CallingBot\Backend\`
   - Copy `callingbot.template.json` to `C:\CallingBot\Config\callingbot.json`
   - Edit `C:\CallingBot\Config\callingbot.json` with production credentials

3. **Apply NTFS permissions**:
   ```powershell
   # Root
   icacls "C:\CallingBot" /inheritance:r /grant "BUILTIN\Administrators:(OI)(CI)(F)" /grant "NT AUTHORITY\SYSTEM:(OI)(CI)(F)" /remove "BUILTIN\Users"

   # Backend
   icacls "C:\CallingBot\Backend" /grant "NT SERVICE\CallingBot:(OI)(CI)(RX)"

   # Config (Read Only)
   icacls "C:\CallingBot\Config" /inheritance:r /grant "BUILTIN\Administrators:(OI)(CI)(F)" /grant "NT AUTHORITY\SYSTEM:(OI)(CI)(F)" /grant "NT SERVICE\CallingBot:(OI)(CI)(R)" /remove "BUILTIN\Users"

   # Logs (Modify/Write)
   icacls "C:\CallingBot\Logs" /grant "NT SERVICE\CallingBot:(OI)(CI)(M)"

   # Service
   icacls "C:\CallingBot\Service" /grant "NT SERVICE\CallingBot:(OI)(CI)(RX)"
   ```
