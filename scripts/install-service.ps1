<#
.SYNOPSIS
    Installs CallingBot as a Windows service using WinSW (CB-019 / CB-020).

.DESCRIPTION
    1. Validates prerequisites (WinSW binary, service XML, CallingBot.exe, config).
    2. Copies WinSW.exe as CallingBot-service.exe into the Service folder.
    3. Copies the service XML configuration alongside it.
    4. Installs the Windows service with WinSW.
    5. Configures the service account and recovery policy via sc.exe.

.PARAMETER InstallRoot
    CallingBot deployment root. Default: C:\CallingBot

.PARAMETER WinSWPath
    Path to WinSW.exe download. If not provided, attempts to download WinSW v3.0.0-alpha.11.

.PARAMETER ServiceAccount
    Service logon account. Default: NT SERVICE\CallingBot (virtual service account).

.PARAMETER StartAfterInstall
    Start the service immediately after installation.

.EXAMPLE
    .\scripts\install-service.ps1 -InstallRoot "C:\CallingBot" -StartAfterInstall
#>

[CmdletBinding()]
param(
    [string]$InstallRoot = "C:\CallingBot",
    [string]$WinSWPath = "",
    [string]$ServiceAccount = "NT SERVICE\CallingBot",
    [switch]$StartAfterInstall
)

$ErrorActionPreference = "Stop"

$serviceDir  = Join-Path $InstallRoot "Service"
$backendDir  = Join-Path $InstallRoot "Backend"
$configDir   = Join-Path $InstallRoot "Config"
$logsDir     = Join-Path $InstallRoot "Logs"
$serviceExe  = Join-Path $serviceDir "CallingBot-service.exe"
$serviceXml  = Join-Path $serviceDir "CallingBot-service.xml"
$callingBotExe = Join-Path $backendDir "CallingBot.exe"
$configFile  = Join-Path $configDir "callingbot.json"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot Service Installer" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Current session is not running as Administrator. Windows service installation requires elevation."
}

# --- Prerequisite checks ---
Write-Host "[1/5] Validating prerequisites..." -ForegroundColor Yellow

if (-not (Test-Path $backendDir)) {
    Write-Error "Backend directory not found: $backendDir. Run init-windows-layout.ps1 first."
}
if (-not (Test-Path $callingBotExe)) {
    Write-Error "CallingBot.exe not found: $callingBotExe. Copy the EXE to $backendDir."
}
if (-not (Test-Path $configFile)) {
    Write-Warning "Config file not found: $configFile. The service will fail to start without it."
}

foreach ($dir in @($serviceDir, $logsDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  Created: $dir" -ForegroundColor Gray
    }
}
Write-Host "  Prerequisites OK" -ForegroundColor Green

# --- Obtain WinSW ---
Write-Host "[2/5] Preparing WinSW..." -ForegroundColor Yellow

if (-not $WinSWPath) {
    $candidates = @(
        (Join-Path $PSScriptRoot "..\service\WinSW-x64.exe"),
        (Join-Path $PSScriptRoot "..\release\service\WinSW-x64.exe")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $WinSWPath = $c
            break
        }
    }
}

if ($WinSWPath -and (Test-Path $WinSWPath)) {
    Copy-Item -Path $WinSWPath -Destination $serviceExe -Force -Confirm:$false
    Write-Host "  Copied WinSW from: $WinSWPath" -ForegroundColor Gray
}
elseif (-not (Test-Path $serviceExe)) {
    $winswUrl = "https://github.com/winsw/winsw/releases/download/v3.0.0-alpha.11/WinSW-x64.exe"
    Write-Host "  Downloading WinSW v3.0.0-alpha.11..." -ForegroundColor Gray
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $winswUrl -OutFile $serviceExe -UseBasicParsing
        Write-Host "  Downloaded to: $serviceExe" -ForegroundColor Green
    }
    catch {
        Write-Error "Failed to download WinSW. Download manually from $winswUrl and pass -WinSWPath."
    }
}
else {
    Write-Host "  WinSW already present: $serviceExe" -ForegroundColor Gray
}

# --- Copy service XML ---
Write-Host "[3/5] Installing service configuration..." -ForegroundColor Yellow

$sourceXml = Join-Path $PSScriptRoot "..\service\CallingBot-service.xml"
if (Test-Path $sourceXml) {
    Copy-Item -Path $sourceXml -Destination $serviceXml -Force -Confirm:$false
    Write-Host "  Copied service XML to: $serviceXml" -ForegroundColor Gray
}
elseif (-not (Test-Path $serviceXml)) {
    Write-Error "Service XML not found. Expected at: $sourceXml"
}

# --- Install Windows service ---
Write-Host "[4/5] Installing Windows service..." -ForegroundColor Yellow

$existingService = Get-Service -Name "CallingBot" -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "  Service 'CallingBot' already exists (Status: $($existingService.Status))" -ForegroundColor Yellow
    if ($existingService.Status -eq "Running") {
        Write-Host "  Stopping existing service..." -ForegroundColor Yellow
        & $serviceExe stop
        Start-Sleep -Seconds 3
    }
    Write-Host "  Uninstalling existing service..." -ForegroundColor Yellow
    & $serviceExe uninstall
    Start-Sleep -Seconds 2
}

& $serviceExe install
if ($LASTEXITCODE -ne 0) {
    Write-Error "WinSW install failed with exit code $LASTEXITCODE."
}
Write-Host "  Service installed successfully" -ForegroundColor Green

# --- Configure recovery policy via sc.exe (CB-020) ---
Write-Host "[5/5] Configuring recovery policy..." -ForegroundColor Yellow

# Recovery: restart after 10s, 30s, 60s — reset failure count after 1 hour
sc.exe failure CallingBot reset= 3600 actions= restart/10000/restart/30000/restart/60000 | Out-Null
sc.exe failureflag CallingBot 1 | Out-Null

# Delayed auto-start
sc.exe config CallingBot start= delayed-auto | Out-Null

# Description
sc.exe description CallingBot "CallingBot VidyaVision backend - campaign management, call dispatch and WebSocket API." | Out-Null

Write-Host "  Recovery: restart at 10s / 30s / 60s, reset after 1 hour" -ForegroundColor Gray
Write-Host "  Startup: Delayed Auto-Start" -ForegroundColor Gray
Write-Host "  Account: $ServiceAccount" -ForegroundColor Gray

# --- Optionally start ---
if ($StartAfterInstall) {
    Write-Host "`nStarting service..." -ForegroundColor Yellow
    & $serviceExe start
    Start-Sleep -Seconds 5
    $svc = Get-Service -Name "CallingBot" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-Host "  Service is RUNNING (PID check via WinSW)" -ForegroundColor Green
    }
    else {
        Write-Warning "Service may not have started. Check logs at: $logsDir"
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Service Name:  CallingBot" -ForegroundColor Gray
Write-Host "  Wrapper:       $serviceExe" -ForegroundColor Gray
Write-Host "  Config XML:    $serviceXml" -ForegroundColor Gray
Write-Host "  Backend EXE:   $callingBotExe" -ForegroundColor Gray
Write-Host "  App Config:    $configFile" -ForegroundColor Gray
Write-Host "  Logs:          $logsDir" -ForegroundColor Gray
Write-Host ""

if (-not $StartAfterInstall) {
    Write-Host "To start: Start-Service CallingBot" -ForegroundColor Yellow
    Write-Host "To check: Get-Service CallingBot" -ForegroundColor Yellow
    Write-Host ""
}
