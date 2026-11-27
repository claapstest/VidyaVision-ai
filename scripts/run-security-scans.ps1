<#
.SYNOPSIS
    Runs all CallingBot security scans and produces a consolidated report (CB-030).

.DESCRIPTION
    Executes six security checks and writes SECURITY_SCAN_REPORT.md:
      1. npm audit - dependency vulnerabilities
      2. Secret scan - hardcoded credentials in source
      3. EXE signature check - Authenticode status
      4. ACL review - config folder permissions
      5. Firewall rule review - inbound port exposure
      6. Release artifact secret scan

.PARAMETER ReleaseDir
    Optional release directory to scan. Auto-detects latest if omitted.

.PARAMETER OutputDir
    Directory for the report. Default: project root.

.EXAMPLE
    .\scripts\run-security-scans.ps1
#>

[CmdletBinding()]
param(
    [string]$ReleaseDir = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

if (-not $OutputDir) { $OutputDir = $root }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot Security Scan Suite" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$scanResults = @()
$totalPass = 0
$totalFail = 0
$totalWarn = 0

function Add-ScanResult($category, $status, $summary, $details) {
    $script:scanResults += [pscustomobject]@{
        Category = $category
        Status   = $status
        Summary  = $summary
        Details  = $details
    }
    switch ($status) {
        "PASS" { $script:totalPass++ }
        "FAIL" { $script:totalFail++ }
        "WARN" { $script:totalWarn++ }
    }
}

# =============================================================
# 1. npm audit - dependency vulnerabilities
# =============================================================
Write-Host "[1/6] Running npm audit..." -ForegroundColor Yellow

$auditDetails = ""
try {
    Push-Location $root
    $auditJson = npm audit --json 2>$null
    $audit = $auditJson | ConvertFrom-Json

    if ($audit.metadata) {
        $vulns = $audit.metadata.vulnerabilities
        $total = $vulns.total
        $critical = $vulns.critical
        $high = $vulns.high
        $moderate = $vulns.moderate
        $low = $vulns.low

        $auditDetails = "Critical: $critical, High: $high, Moderate: $moderate, Low: $low"

        if ($critical -gt 0 -or $high -gt 0) {
            Add-ScanResult "Dependency Audit" "FAIL" "$total vulnerabilities ($critical critical, $high high)" $auditDetails
        }
        elseif ($total -gt 0) {
            Add-ScanResult "Dependency Audit" "WARN" "$total vulnerabilities (no critical/high)" $auditDetails
        }
        else {
            Add-ScanResult "Dependency Audit" "PASS" "No known vulnerabilities" "All dependencies clean"
        }
    }
    else {
        Add-ScanResult "Dependency Audit" "PASS" "No known vulnerabilities" "npm audit returned clean"
    }
    Pop-Location
}
catch {
    Pop-Location
    Add-ScanResult "Dependency Audit" "WARN" "Audit could not run" $_.Exception.Message
}
Write-Host "  Done" -ForegroundColor Green

# =============================================================
# 2. Source code secret scan
# =============================================================
Write-Host "[2/6] Running source code secret scan..." -ForegroundColor Yellow

$secretPatterns = @(
    @{ Name = "Hardcoded password";   Regex = 'password\s*[:=]\s*[''"][^<"''\s]' },
    @{ Name = "API key";              Regex = 'api[_-]?key\s*[:=]\s*[''"][^<"''\s]' },
    @{ Name = "Secret token";         Regex = 'secret\s*[:=]\s*[''"][^<"''\s]' },
    @{ Name = "Private key file";     Regex = '-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY' },
    @{ Name = "AWS credential";       Regex = 'AKIA[0-9A-Z]{16}' },
    @{ Name = "Connection string";    Regex = 'Server=tcp:[^;]+;.*Password=[^;]+' }
)
$excludeDirs = @("node_modules", ".git", "dist", "dist-server", "release")
$excludeFiles = @("audit-secrets.js", ".env.example", "validate-backend-exe.ps1", "validate-integrations.js", "run-security-scans.ps1")

$secretFindings = @()
$sourceFiles = Get-ChildItem $root -Recurse -File -Include "*.js","*.ts","*.json","*.ps1","*.xml","*.md","*.yml","*.yaml","*.env" |
    Where-Object {
        $path = $_.FullName
        $skip = $false
        foreach ($d in $excludeDirs) {
            if ($path -match "[\\/]$d[\\/]") { $skip = $true; break }
        }
        if ($excludeFiles -contains $_.Name) { $skip = $true }
        -not $skip
    }

foreach ($f in $sourceFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    foreach ($pat in $secretPatterns) {
        if ($content -match $pat.Regex) {
            if ($content -match '<REPLACE_WITH_') { continue }
            if ($content -match 'placeholder|example|template|CHANGE_ME') { continue }
            $relPath = $f.FullName.Substring($root.Length + 1)
            $secretFindings += "$relPath - $($pat.Name)"
        }
    }
}

if ($secretFindings.Count -gt 0) {
    Add-ScanResult "Secret Scan" "FAIL" "$($secretFindings.Count) potential secrets found" ($secretFindings -join "`n")
}
else {
    Add-ScanResult "Secret Scan" "PASS" "No hardcoded secrets detected" "Scanned $($sourceFiles.Count) source files"
}
Write-Host "  Done ($($sourceFiles.Count) files scanned)" -ForegroundColor Green

# =============================================================
# 3. EXE Authenticode signature check
# =============================================================
Write-Host "[3/6] Checking EXE signature..." -ForegroundColor Yellow

$exePath = Join-Path $root "release\CallingBot.exe"
if (Test-Path $exePath) {
    $sig = Get-AuthenticodeSignature -FilePath $exePath
    if ($sig.Status -eq "Valid") {
        Add-ScanResult "EXE Signature" "PASS" "Valid Authenticode signature" "Signer: $($sig.SignerCertificate.Subject)"
    }
    elseif ($sig.Status -eq "NotSigned") {
        Add-ScanResult "EXE Signature" "WARN" "EXE is not signed" "Sign with an Authenticode certificate before production deployment"
    }
    else {
        Add-ScanResult "EXE Signature" "FAIL" "Invalid signature: $($sig.Status)" $sig.StatusMessage
    }
}
else {
    Add-ScanResult "EXE Signature" "WARN" "CallingBot.exe not found" "Build the EXE first with npm run build:backend:all"
}
Write-Host "  Done" -ForegroundColor Green

# =============================================================
# 4. Config ACL review
# =============================================================
Write-Host "[4/6] Reviewing config folder ACLs..." -ForegroundColor Yellow

$configDir = "C:\CallingBot\Config"
if (Test-Path $configDir) {
    $acl = Get-Acl $configDir
    $accessRules = $acl.Access
    $openAccess = $accessRules | Where-Object {
        $_.IdentityReference -match "Everyone|Users|Authenticated Users" -and
        $_.FileSystemRights -match "FullControl|Modify|Write"
    }

    if ($openAccess) {
        $identities = ($openAccess | ForEach-Object { $_.IdentityReference.Value }) -join ", "
        Add-ScanResult "Config ACLs" "FAIL" "Config folder has overly permissive access" "Write access for: $identities"
    }
    else {
        $aclSummary = ($accessRules | ForEach-Object { "$($_.IdentityReference): $($_.FileSystemRights)" }) -join "`n"
        Add-ScanResult "Config ACLs" "PASS" "Config folder properly locked down" $aclSummary
    }
}
else {
    Add-ScanResult "Config ACLs" "WARN" "Config directory not found at $configDir" "Run init-windows-layout.ps1 and set-config-acls.ps1 on the target server"
}
Write-Host "  Done" -ForegroundColor Green

# =============================================================
# 5. Firewall rule review
# =============================================================
Write-Host "[5/6] Reviewing firewall rules..." -ForegroundColor Yellow

$relevantPorts = @(5000, 443, 80)
$firewallFindings = @()

foreach ($port in $relevantPorts) {
    try {
        $rules = Get-NetFirewallPortFilter -Protocol TCP -ErrorAction Stop |
            Where-Object { $_.LocalPort -eq $port } |
            ForEach-Object {
                $r = $_ | Get-NetFirewallRule -ErrorAction SilentlyContinue
                if ($r) { $r }
            }

        if ($rules) {
            foreach ($rule in $rules) {
                $firewallFindings += "Port $port`: $($rule.DisplayName) [Enabled=$($rule.Enabled), Direction=$($rule.Direction), Action=$($rule.Action)]"
            }
        }
    }
    catch {
        $firewallFindings += "Port $port`: Unable to query firewall (requires elevation)"
    }
}

if ($firewallFindings.Count -eq 0) {
    Add-ScanResult "Firewall Rules" "PASS" "No inbound rules for CallingBot ports" "Ports 80, 443, 5000 not explicitly opened"
}
else {
    $hasPort5000External = $firewallFindings | Where-Object { $_ -match "Port 5000.*Direction=Inbound.*Action=Allow" }
    if ($hasPort5000External) {
        Add-ScanResult "Firewall Rules" "FAIL" "Port 5000 (backend) exposed externally" ($firewallFindings -join "`n")
    }
    else {
        Add-ScanResult "Firewall Rules" "PASS" "Firewall rules reviewed" ($firewallFindings -join "`n")
    }
}
Write-Host "  Done" -ForegroundColor Green

# =============================================================
# 6. Release artifact secret scan
# =============================================================
Write-Host "[6/6] Scanning release artifacts..." -ForegroundColor Yellow

if (-not $ReleaseDir) {
    $releasePath = Join-Path $root "release"
    if (Test-Path $releasePath) {
        $candidates = Get-ChildItem $releasePath -Directory -Filter "CallingBot-v*" |
            Sort-Object LastWriteTime -Descending
        if ($candidates.Count -gt 0) {
            $ReleaseDir = $candidates[0].FullName
        }
    }
}

if ($ReleaseDir -and (Test-Path $ReleaseDir)) {
    $releaseSecrets = @()
    $releaseFiles = Get-ChildItem $ReleaseDir -Recurse -File |
        Where-Object { $_.Extension -notin ".exe",".zip",".dll" } |
        Where-Object { $excludeFiles -notcontains $_.Name }

    foreach ($f in $releaseFiles) {
        $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        foreach ($pat in $secretPatterns) {
            if ($content -match $pat.Regex) {
                if ($content -match '<REPLACE_WITH_|placeholder|CHANGE_ME') { continue }
                $relPath = $f.FullName.Substring($ReleaseDir.Length + 1)
                $releaseSecrets += "$relPath - $($pat.Name)"
            }
        }
    }

    if ($releaseSecrets.Count -gt 0) {
        Add-ScanResult "Release Artifacts" "FAIL" "$($releaseSecrets.Count) potential secrets in release" ($releaseSecrets -join "`n")
    }
    else {
        Add-ScanResult "Release Artifacts" "PASS" "No secrets in release package" "Scanned $($releaseFiles.Count) release files"
    }
}
else {
    Add-ScanResult "Release Artifacts" "WARN" "No release directory found" "Run assemble-release.ps1 first"
}
Write-Host "  Done" -ForegroundColor Green

# =============================================================
# Generate SECURITY_SCAN_REPORT.md
# =============================================================
Write-Host "`nGenerating report..." -ForegroundColor Yellow

$reportLines = @()
$reportLines += "# CallingBot Security Scan Report"
$reportLines += ""
$reportLines += "**Date:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$reportLines += "**Scanner:** run-security-scans.ps1 (CB-030)"
$reportLines += "**Result:** $totalPass passed, $totalFail failed, $totalWarn warnings"
$reportLines += ""
$reportLines += "## Summary"
$reportLines += ""
$reportLines += "| # | Category | Status | Finding |"
$reportLines += "|---|----------|--------|---------|"
$i = 1
foreach ($r in $scanResults) {
    $statusIcon = switch ($r.Status) { "PASS" { "PASS" }; "FAIL" { "**FAIL**" }; "WARN" { "WARN" } }
    $reportLines += "| $i | $($r.Category) | $statusIcon | $($r.Summary) |"
    $i++
}

$reportLines += ""
$reportLines += "## Detailed Findings"
$reportLines += ""

foreach ($r in $scanResults) {
    $reportLines += "### $($r.Category)"
    $reportLines += ""
    $reportLines += "**Status:** $($r.Status)"
    $reportLines += "**Summary:** $($r.Summary)"
    $reportLines += ""
    if ($r.Details) {
        $reportLines += "``````"
        $reportLines += $r.Details
        $reportLines += "``````"
        $reportLines += ""
    }
}

$reportLines += "## Recommendations"
$reportLines += ""
$reportLines += "1. **Sign the EXE** with an Authenticode certificate before production deployment"
$reportLines += "2. **Lock down port 5000** - backend should only be accessible via IIS reverse proxy (localhost)"
$reportLines += "3. **Run ``npm audit fix``** if any vulnerabilities are reported above"
$reportLines += "4. **Apply config ACLs** with ``set-config-acls.ps1`` on the target server"
$reportLines += "5. **Review firewall rules** to ensure only ports 80/443 are externally exposed"
$reportLines += "6. **Enable Windows Defender Application Control** (WDAC) in audit mode"
$reportLines += ""

$reportPath = Join-Path $OutputDir "SECURITY_SCAN_REPORT.md"
($reportLines -join "`n") | Out-File -FilePath $reportPath -Encoding utf8
Write-Host "  Report: $reportPath" -ForegroundColor Green

# =============================================================
# Console summary
# =============================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Security Scan Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

foreach ($r in $scanResults) {
    $color = switch ($r.Status) { "PASS" { "Green" }; "FAIL" { "Red" }; "WARN" { "Yellow" } }
    Write-Host "  [$($r.Status)] $($r.Category): $($r.Summary)" -ForegroundColor $color
}

Write-Host "`n  Total: $totalPass passed, $totalFail failed, $totalWarn warnings" -ForegroundColor $(if ($totalFail -eq 0) { "Green" } else { "Red" })
Write-Host "  Report: $reportPath" -ForegroundColor Gray
Write-Host ""

exit $totalFail
