<#
.SYNOPSIS
    Applies least-privilege Windows NTFS Access Control Lists (ACLs) to CallingBot configuration files (CB-017).

.DESCRIPTION
    Restricts access to the CallingBot configuration file and directory so that only:
    - BUILTIN\Administrators (Full Control)
    - NT AUTHORITY\SYSTEM (Full Control)
    - Pinned Service Account (Read Only)
    can access secret material. Removes all permissions for standard Users and Everyone.

.PARAMETER ConfigPath
    Absolute path to the CallingBot configuration file or directory.
    Default: "C:\CallingBot\config\callingbot.json"

.PARAMETER ServiceAccount
    The Windows account running the CallingBot service.
    Default: "NT SERVICE\CallingBot" (or "CallingBotSvc", "NETWORK SERVICE", etc.)

.EXAMPLE
    .\scripts\set-config-acls.ps1 -ConfigPath "C:\CallingBot\config\callingbot.json" -ServiceAccount "NT SERVICE\CallingBot"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigPath = "C:\CallingBot\config\callingbot.json",

    [Parameter(Mandatory = $false)]
    [string]$ServiceAccount = "NT SERVICE\CallingBot"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot NTFS ACL Lockdown (CB-017)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not (Test-Path $ConfigPath)) {
    Write-Warning "Target path does not exist: $ConfigPath"
    $parentDir = Split-Path -Parent $ConfigPath
    if ($parentDir -and -not (Test-Path $parentDir)) {
        Write-Host "Creating parent directory: $parentDir" -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
}

Write-Host "Config Target:   $ConfigPath" -ForegroundColor Gray
Write-Host "Service Account: $ServiceAccount" -ForegroundColor Gray

# Step 1: Disable inheritance and copy current inherited ACEs to explicit ACEs
Write-Host "`n[1/4] Disabling inheritance and converting to explicit permissions..." -ForegroundColor Yellow
icacls $ConfigPath /inheritance:r | Out-Null

# Step 2: Grant Full Control to Administrators and SYSTEM
Write-Host "[2/4] Granting Full Control to BUILTIN\Administrators and SYSTEM..." -ForegroundColor Yellow
icacls $ConfigPath /grant "BUILTIN\Administrators:(F)" | Out-Null
icacls $ConfigPath /grant "NT AUTHORITY\SYSTEM:(F)" | Out-Null

# Step 3: Grant Read-Only to Service Account (if account exists / can be resolved)
Write-Host "[3/4] Granting Read access to $ServiceAccount..." -ForegroundColor Yellow
try {
    icacls $ConfigPath /grant "${ServiceAccount}:(R)" | Out-Null
} catch {
    Write-Warning "Could not apply ACE for '$ServiceAccount'. Ensure the service account exists on this machine."
}

# Step 4: Remove standard users and everyone
Write-Host "[4/4] Removing permissions for Users and Everyone..." -ForegroundColor Yellow
icacls $ConfigPath /remove "BUILTIN\Users" 2>$null | Out-Null
icacls $ConfigPath /remove "Users" 2>$null | Out-Null
icacls $ConfigPath /remove "Everyone" 2>$null | Out-Null
icacls $ConfigPath /remove "Authenticated Users" 2>$null | Out-Null

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  ACL Lockdown Applied Successfully" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Effective Permissions on ${ConfigPath}:" -ForegroundColor Cyan
icacls $ConfigPath
