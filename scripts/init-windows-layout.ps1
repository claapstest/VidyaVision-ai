<#
.SYNOPSIS
    Provisions the standardized Windows application folder structure for CallingBot (CB-018).

.DESCRIPTION
    Creates the agreed application folder layout:
      <InstallRoot>\
      ├── Backend\    (CallingBot.exe and binary dependencies)
      ├── Config\     (callingbot.json and configuration templates)
      ├── Logs\       (stdout, stderr, and rotated service logs)
      └── Service\    (WinSW service wrapper, XML configuration, install scripts)
    
    Applies least-privilege NTFS ACL permissions:
    - Backend: Read & Execute for Service Account
    - Config:  Read-Only for Service Account (inheritance blocked)
    - Logs:    Modify/Write for Service Account (allows creating & appending logs)
    - Service: Read & Execute for Service Account
    - Standard Users / Everyone: Access removed across all folders

.PARAMETER InstallRoot
    Root directory for CallingBot deployment. Default: "C:\CallingBot"

.PARAMETER ServiceAccount
    The Windows account under which the service runs. Default: "NT SERVICE\CallingBot"

.PARAMETER CopyArtifacts
    If specified, automatically copies available release artifacts into the created folders.

.PARAMETER SkipAcl
    Skips NTFS ACL application (useful for non-elevated testing).

.EXAMPLE
    .\scripts\init-windows-layout.ps1 -InstallRoot "C:\CallingBot" -ServiceAccount "NT SERVICE\CallingBot" -CopyArtifacts
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$InstallRoot = "C:\CallingBot",

    [Parameter(Mandatory = $false)]
    [string]$ServiceAccount = "NT SERVICE\CallingBot",

    [switch]$CopyArtifacts,
    [switch]$SkipAcl
)

$ErrorActionPreference = "Stop"

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "  CallingBot Windows Layout Provisioning (CB-018)" -ForegroundColor Cyan
Write-Host "==================================================`n" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $SkipAcl) {
    Write-Warning "Current session is not running as Administrator."
    Write-Warning "NTFS ACL configuration will be skipped. Run as Administrator on production servers to apply ACLs."
    $SkipAcl = $true
}

$scriptRoot = Split-Path -Parent $PSScriptRoot
if (-not $scriptRoot) { $scriptRoot = Get-Location }

$backendDir = Join-Path $InstallRoot "Backend"
$configDir  = Join-Path $InstallRoot "Config"
$logsDir    = Join-Path $InstallRoot "Logs"
$serviceDir = Join-Path $InstallRoot "Service"

$subdirs = @(
    @{ Name = "Backend"; Path = $backendDir; Desc = "Application executable and binaries" },
    @{ Name = "Config";  Path = $configDir;  Desc = "Production configuration and secrets" },
    @{ Name = "Logs";    Path = $logsDir;    Desc = "Operational logs, stdout and stderr" },
    @{ Name = "Service"; Path = $serviceDir; Desc = "Windows Service wrapper and control scripts" }
)

# Step 1: Create directory tree
Write-Host "[1/3] Creating application folder hierarchy at $InstallRoot..." -ForegroundColor Yellow
if (-not (Test-Path $InstallRoot)) {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
}

foreach ($dir in $subdirs) {
    if (-not (Test-Path $dir.Path)) {
        New-Item -ItemType Directory -Path $dir.Path -Force | Out-Null
        Write-Host "  [+] Created: $($dir.Name) ($($dir.Desc))" -ForegroundColor Green
    } else {
        Write-Host "  [=] Exists:  $($dir.Name) ($($dir.Path))" -ForegroundColor Gray
    }
}

# Step 2: Copy artifacts if requested
if ($CopyArtifacts) {
    Write-Host "`n[2/3] Copying build and configuration artifacts..." -ForegroundColor Yellow

    # Copy EXE
    $srcExe = Join-Path $scriptRoot "release\CallingBot.exe"
    if (Test-Path $srcExe) {
        Copy-Item -Path $srcExe -Destination (Join-Path $backendDir "CallingBot.exe") -Force
        Write-Host "  ✓ Copied CallingBot.exe -> Backend\" -ForegroundColor Green
    } else {
        Write-Warning "Source CallingBot.exe not found at $srcExe (run 'npm run build:backend:exe' first)"
    }

    # Copy Config template
    $srcTemplate = Join-Path $scriptRoot "config\callingbot.template.json"
    if (Test-Path $srcTemplate) {
        Copy-Item -Path $srcTemplate -Destination (Join-Path $configDir "callingbot.template.json") -Force
        # If production callingbot.json doesn't exist, create initial copy from template
        $prodConfig = Join-Path $configDir "callingbot.json"
        if (-not (Test-Path $prodConfig)) {
            Copy-Item -Path $srcTemplate -Destination $prodConfig -Force
            Write-Host "  ✓ Initialized callingbot.json from template -> Config\" -ForegroundColor Green
        }
        Write-Host "  ✓ Copied callingbot.template.json -> Config\" -ForegroundColor Green
    }

    # Copy Service XML configuration
    $srcServiceXml = Join-Path $scriptRoot "service\CallingBot-service.xml"
    if (Test-Path $srcServiceXml) {
        Copy-Item -Path $srcServiceXml -Destination (Join-Path $serviceDir "CallingBot-service.xml") -Force
        Write-Host "  ✓ Copied CallingBot-service.xml -> Service\" -ForegroundColor Green
    }

    # Write placeholder service script if empty
    $serviceReadme = Join-Path $serviceDir "README.txt"
    if (-not (Test-Path $serviceReadme)) {
        Set-Content -Path $serviceReadme -Value "CallingBot Windows Service Wrapper Directory (WinSW / native host).`nRefer to EPIC-04 / CB-019 for service installation."
    }
} else {
    Write-Host "`n[2/3] Skipping artifact copy (use -CopyArtifacts to copy files)." -ForegroundColor Gray
}

# Step 3: Apply Least-Privilege NTFS Permissions
if (-not $SkipAcl) {
    Write-Host "`n[3/3] Applying least-privilege NTFS ACLs..." -ForegroundColor Yellow

    # 3a. Root directory
    try {
        icacls $InstallRoot /inheritance:r | Out-Null
        icacls $InstallRoot /grant "BUILTIN\Administrators:(OI)(CI)(F)" | Out-Null
        icacls $InstallRoot /grant "NT AUTHORITY\SYSTEM:(OI)(CI)(F)" | Out-Null
        icacls $InstallRoot /remove "BUILTIN\Users" 2>$null | Out-Null
        icacls $InstallRoot /remove "Users" 2>$null | Out-Null
        icacls $InstallRoot /remove "Everyone" 2>$null | Out-Null
        Write-Host "  ✓ Root folder ($InstallRoot): Admin/SYSTEM Full Control, Users removed" -ForegroundColor Green
    } catch {
        Write-Warning "Could not configure ACLs on $InstallRoot (run as Administrator)."
    }

    # 3b. Backend (Read & Execute for Service)
    try {
        icacls $backendDir /grant "${ServiceAccount}:(OI)(CI)(RX)" 2>$null | Out-Null
        Write-Host "  ✓ Backend folder: $ServiceAccount granted Read & Execute" -ForegroundColor Green
    } catch { }

    # 3c. Config (Read-Only for Service, inheritance blocked)
    try {
        icacls $configDir /inheritance:r | Out-Null
        icacls $configDir /grant "BUILTIN\Administrators:(OI)(CI)(F)" | Out-Null
        icacls $configDir /grant "NT AUTHORITY\SYSTEM:(OI)(CI)(F)" | Out-Null
        icacls $configDir /grant "${ServiceAccount}:(OI)(CI)(R)" 2>$null | Out-Null
        icacls $configDir /remove "BUILTIN\Users" 2>$null | Out-Null
        icacls $configDir /remove "Everyone" 2>$null | Out-Null
        Write-Host "  ✓ Config folder: $ServiceAccount granted Read-Only, broad access removed" -ForegroundColor Green
    } catch { }

    # 3d. Logs (Modify/Write for Service to append logs)
    try {
        icacls $logsDir /grant "${ServiceAccount}:(OI)(CI)(M)" 2>$null | Out-Null
        Write-Host "  ✓ Logs folder: $ServiceAccount granted Modify/Write (for log output)" -ForegroundColor Green
    } catch { }

    # 3e. Service (Read & Execute for Service)
    try {
        icacls $serviceDir /grant "${ServiceAccount}:(OI)(CI)(RX)" 2>$null | Out-Null
        Write-Host "  ✓ Service folder: $ServiceAccount granted Read & Execute" -ForegroundColor Green
    } catch { }
} else {
    Write-Host "`n[3/3] Skipping ACL configuration (-SkipAcl specified)." -ForegroundColor Gray
}

# Write metadata manifest
$manifest = [ordered]@{
    Application    = "CallingBot"
    Version        = "1.0.0"
    ProvisionDate  = (Get-Date).ToString("o")
    InstallRoot    = $InstallRoot
    ServiceAccount = $ServiceAccount
    Folders        = [ordered]@{
        Backend = @{ Path = $backendDir; ExpectedRights = "ReadAndExecute" }
        Config  = @{ Path = $configDir;  ExpectedRights = "Read" }
        Logs    = @{ Path = $logsDir;    ExpectedRights = "Modify" }
        Service = @{ Path = $serviceDir; ExpectedRights = "ReadAndExecute" }
    }
}
$manifestPath = Join-Path $InstallRoot "layout-manifest.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "`n✓ Layout manifest written to $manifestPath" -ForegroundColor Cyan

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "  Windows Folder Structure Provisioned Successfully" -ForegroundColor Green
Write-Host "==================================================`n" -ForegroundColor Green
