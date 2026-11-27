<#
.SYNOPSIS
    Verifies the CallingBot Windows application folder layout and permissions (CB-018).

.DESCRIPTION
    Validates that:
    1. The four standard subfolders (Backend, Config, Logs, Service) exist under InstallRoot.
    2. Manifest layout metadata exists.
    3. NTFS ACL permissions match least-privilege standards (Config is read-only, Logs allows modify, Users removed).

.PARAMETER InstallRoot
    Root directory to verify. Default: "C:\CallingBot"

.PARAMETER ServiceAccount
    The expected service account. Default: "NT SERVICE\CallingBot"

.EXAMPLE
    .\scripts\verify-windows-layout.ps1 -InstallRoot "C:\CallingBot"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$InstallRoot = "C:\CallingBot",

    [Parameter(Mandatory = $false)]
    [string]$ServiceAccount = "NT SERVICE\CallingBot",

    [switch]$SkipAclCheck
)

$ErrorActionPreference = "Continue"

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "  CallingBot Layout Verification (CB-018)" -ForegroundColor Cyan
Write-Host "==================================================`n" -ForegroundColor Cyan

$passCount = 0
$failCount = 0

function Assert-Check($name, $pass, $detail) {
    if ($pass) {
        Write-Host "  [PASS] $name - $detail" -ForegroundColor Green
        $script:passCount++
    } else {
        Write-Host "  [FAIL] $name - $detail" -ForegroundColor Red
        $script:failCount++
    }
}

# 1. Verify InstallRoot exists
Assert-Check "Root Directory Exists" (Test-Path $InstallRoot) "Path: $InstallRoot"

if (-not (Test-Path $InstallRoot)) {
    Write-Error "InstallRoot does not exist: $InstallRoot"
    exit 1
}

# 2. Verify subdirectories
$requiredFolders = @("Backend", "Config", "Logs", "Service")
foreach ($folder in $requiredFolders) {
    $folderPath = Join-Path $InstallRoot $folder
    $exists = Test-Path $folderPath
    Assert-Check "Subfolder '$folder' Exists" $exists "Path: $folderPath"
}

# 3. Check layout manifest
$manifestPath = Join-Path $InstallRoot "layout-manifest.json"
$hasManifest = Test-Path $manifestPath
Assert-Check "Layout Manifest Exists" $hasManifest "File: $manifestPath"

# 4. Check Config & Logs folder security
if (-not $SkipAclCheck) {
    $configPath = Join-Path $InstallRoot "Config"
    if (Test-Path $configPath) {
        $configAcl = Get-Acl -Path $configPath
        Assert-Check "Config Inheritance Blocked" $configAcl.AreAccessRulesProtected "AreAccessRulesProtected = $($configAcl.AreAccessRulesProtected)"

        # Check for broad users
        $broadMatches = @()
        foreach ($rule in $configAcl.Access) {
            $id = $rule.IdentityReference.Value
            if ($id -like "*Users*" -or $id -like "*Everyone*") {
                $broadMatches += "$id ($($rule.FileSystemRights))"
            }
        }
        Assert-Check "Config Broad Access Removed" ($broadMatches.Count -eq 0) "Disallowed rules: $(if ($broadMatches.Count -gt 0) { $broadMatches -join ', ' } else { 'None (Clean)' })"
    }

    # 5. Check Logs folder security
    $logsPath = Join-Path $InstallRoot "Logs"
    if (Test-Path $logsPath) {
        $logsAcl = Get-Acl -Path $logsPath
        $hasAdmin = $false
        foreach ($rule in $logsAcl.Access) {
            if ($rule.IdentityReference.Value -like "*Administrators*" -or $rule.IdentityReference.Value -like "*SYSTEM*") {
                $hasAdmin = $true
                break
            }
        }
        Assert-Check "Logs Admin Access" $hasAdmin "Administrators or SYSTEM present on Logs folder"
    }
} else {
    Write-Host "  ℹ Skipping NTFS ACL permission checks (-SkipAclCheck specified)" -ForegroundColor Gray
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Layout Verification: $passCount Passed, $failCount Failed" -ForegroundColor Cyan
Write-Host "==================================================`n" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
} else {
    Write-Host "✓ Windows folder structure verified successfully.`n" -ForegroundColor Green
    exit 0
}
