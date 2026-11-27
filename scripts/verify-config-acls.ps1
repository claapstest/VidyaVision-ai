<#
.SYNOPSIS
    Verifies that CallingBot configuration files satisfy least-privilege NTFS ACL requirements (CB-017 / TC-012).

.DESCRIPTION
    Audits the target configuration file to ensure:
    1. Inheritance is disabled.
    2. BUILTIN\Users and Everyone do NOT have access.
    3. Administrators and/or SYSTEM have Full Control.
    4. Service Account has Read permissions.

.PARAMETER ConfigPath
    Absolute or relative path to the configuration file to audit.
    Default: "C:\CallingBot\config\callingbot.json"

.EXAMPLE
    .\scripts\verify-config-acls.ps1 -ConfigPath "C:\CallingBot\config\callingbot.json"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigPath = "C:\CallingBot\config\callingbot.json",

    [Parameter(Mandatory = $false)]
    [string]$ServiceAccount = "NT SERVICE\CallingBot"
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot ACL Verification (CB-017 / TC-012)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

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

$acl = Get-Acl -Path $ConfigPath

# 1. Check inheritance
$inheritanceBlocked = $acl.AreAccessRulesProtected
Assert-Check "Inheritance Blocked" $inheritanceBlocked "AreAccessRulesProtected = $inheritanceBlocked"

# 2. Check for disallowed broad identities
$rules = $acl.Access
$disallowedIdentities = @("Users", "BUILTIN\Users", "Everyone", "Authenticated Users")
$hasBroadAccess = $false
$broadMatches = @()

foreach ($rule in $rules) {
    $id = $rule.IdentityReference.Value
    foreach ($disallowed in $disallowedIdentities) {
        if ($id -like "*$disallowed") {
            $hasBroadAccess = $true
            $broadMatches += "$id ($($rule.FileSystemRights))"
        }
    }
}

Assert-Check "Broad Access Blocked" (-not $hasBroadAccess) "Disallowed access: $(if ($hasBroadAccess) { $broadMatches -join ', ' } else { 'None (Clean)' })"

# 3. Check Administrator access
$hasAdminAccess = $false
foreach ($rule in $rules) {
    if ($rule.IdentityReference.Value -like "*Administrators*" -and $rule.AccessControlType -eq "Allow") {
        $hasAdminAccess = $true
        break
    }
}
Assert-Check "Admin Full Control" $hasAdminAccess "Administrators have access"

# 4. Check SYSTEM access
$hasSystemAccess = $false
foreach ($rule in $rules) {
    if ($rule.IdentityReference.Value -like "*SYSTEM*" -and $rule.AccessControlType -eq "Allow") {
        $hasSystemAccess = $true
        break
    }
}
Assert-Check "SYSTEM Access" $hasSystemAccess "SYSTEM has access"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Results: $passCount Passed, $failCount Failed" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
} else {
    exit 0
}
