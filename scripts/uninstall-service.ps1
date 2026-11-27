<#
.SYNOPSIS
    Uninstalls the CallingBot Windows service (CB-019).

.PARAMETER InstallRoot
    CallingBot deployment root. Default: C:\CallingBot

.PARAMETER RemoveServiceFiles
    Also remove WinSW binaries and XML from the Service folder.

.EXAMPLE
    .\scripts\uninstall-service.ps1 -InstallRoot "C:\CallingBot"
#>

[CmdletBinding()]
param(
    [string]$InstallRoot = "C:\CallingBot",
    [switch]$RemoveServiceFiles
)

$ErrorActionPreference = "Stop"

$serviceDir = Join-Path $InstallRoot "Service"
$serviceExe = Join-Path $serviceDir "CallingBot-service.exe"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot Service Uninstaller" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$svc = Get-Service -Name "CallingBot" -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "Service 'CallingBot' is not installed." -ForegroundColor Yellow
    exit 0
}

if ($svc.Status -eq "Running") {
    Write-Host "Stopping service..." -ForegroundColor Yellow
    if (Test-Path $serviceExe) {
        & $serviceExe stop
    }
    else {
        Stop-Service -Name "CallingBot" -Force -Confirm:$false
    }
    Start-Sleep -Seconds 3
}

Write-Host "Uninstalling service..." -ForegroundColor Yellow
if (Test-Path $serviceExe) {
    & $serviceExe uninstall
}
else {
    sc.exe delete CallingBot | Out-Null
}

Start-Sleep -Seconds 2

$check = Get-Service -Name "CallingBot" -ErrorAction SilentlyContinue
if ($check) {
    Write-Warning "Service may still be registered (pending reboot)."
}
else {
    Write-Host "Service uninstalled successfully." -ForegroundColor Green
}

if ($RemoveServiceFiles -and (Test-Path $serviceDir)) {
    Remove-Item -Path (Join-Path $serviceDir "CallingBot-service.*") -Force -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed service wrapper files from: $serviceDir" -ForegroundColor Gray
}

Write-Host ""
