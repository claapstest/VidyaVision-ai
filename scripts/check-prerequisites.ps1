<#
.SYNOPSIS
    Validates client infrastructure prerequisites for CallingBot deployment (CB-033).

.DESCRIPTION
    Checks the target server meets all requirements:
      1. Windows Server 2019+ x64
      2. IIS installed with required modules (URL Rewrite, ARR)
      3. .NET Framework 4.7.2+
      4. Required ports available (80, 443, 5000)
      5. TLS/SSL certificate bound
      6. Disk space (500 MB minimum)
      7. Memory (2 GB available minimum)
      8. SQL Server connectivity
      9. Outbound HTTPS (for OmniDimension API)
     10. Service account permissions

    Produces PREREQUISITES_REPORT.md with results and remediation steps.

.PARAMETER SqlServer
    SQL Server hostname to test connectivity. Default: skip.

.PARAMETER SiteName
    IIS site name to check. Default: "Default Web Site"

.EXAMPLE
    .\scripts\check-prerequisites.ps1
    .\scripts\check-prerequisites.ps1 -SqlServer "db.example.com"
#>

[CmdletBinding()]
param(
    [string]$SqlServer = "",
    [string]$SiteName = "Default Web Site"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot Infrastructure Prerequisites" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$checks = @()

function Add-Check($category, $item, $status, $detail, $remediation) {
    $script:checks += [pscustomobject]@{
        Category    = $category
        Item        = $item
        Status      = $status
        Detail      = $detail
        Remediation = $remediation
    }
    $color = switch ($status) { "PASS" { "Green" }; "FAIL" { "Red" }; "WARN" { "Yellow" }; "INFO" { "Gray" } }
    Write-Host "  [$status] $item — $detail" -ForegroundColor $color
}

# =============================================================
# 1. OS Version and Architecture
# =============================================================
Write-Host "[1/10] Operating system..." -ForegroundColor Yellow

$os = Get-CimInstance Win32_OperatingSystem
$osName = $os.Caption
$osBuild = [int]$os.BuildNumber
$arch = $env:PROCESSOR_ARCHITECTURE

Add-Check "OS" "Windows Server or Windows 10+" $(if ($osBuild -ge 17763) { "PASS" } else { "FAIL" }) "$osName (Build $osBuild)" "Requires Windows Server 2019+ or Windows 10 1809+"
Add-Check "OS" "x64 architecture" $(if ($arch -eq "AMD64") { "PASS" } else { "FAIL" }) $arch "CallingBot EXE is x64 only"

# =============================================================
# 2. IIS Installed
# =============================================================
Write-Host "[2/10] IIS and modules..." -ForegroundColor Yellow

$iisInstalled = $false
try {
    $iisFeature = Get-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -ErrorAction Stop
    $iisInstalled = ($iisFeature.State -eq "Enabled")
}
catch {
    try {
        $iisFeature = Get-WindowsFeature -Name Web-Server -ErrorAction Stop
        $iisInstalled = $iisFeature.Installed
    }
    catch {
        $iisService = Get-Service -Name W3SVC -ErrorAction SilentlyContinue
        $iisInstalled = ($null -ne $iisService)
    }
}
Add-Check "IIS" "IIS Web Server installed" $(if ($iisInstalled) { "PASS" } else { "FAIL" }) $(if ($iisInstalled) { "Enabled" } else { "Not found" }) "Install-WindowsFeature Web-Server -IncludeManagementTools"

# URL Rewrite module
$urlRewrite = Test-Path "HKLM:\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite"
if (-not $urlRewrite) {
    $urlRewrite = Test-Path "${env:SystemRoot}\System32\inetsrv\rewrite.dll"
}
Add-Check "IIS" "URL Rewrite module" $(if ($urlRewrite) { "PASS" } else { "FAIL" }) $(if ($urlRewrite) { "Installed" } else { "Not found" }) "Download from https://www.iis.net/downloads/microsoft/url-rewrite"

# ARR module
$arr = Test-Path "HKLM:\SOFTWARE\Microsoft\IIS Extensions\Application Request Routing"
if (-not $arr) {
    $arr = Test-Path "${env:SystemRoot}\System32\inetsrv\arr.dll"
}
Add-Check "IIS" "Application Request Routing (ARR)" $(if ($arr) { "PASS" } else { "FAIL" }) $(if ($arr) { "Installed" } else { "Not found" }) "Download from https://www.iis.net/downloads/microsoft/application-request-routing"

# =============================================================
# 3. .NET Framework
# =============================================================
Write-Host "[3/10] .NET Framework..." -ForegroundColor Yellow

$dotnetRelease = 0
try {
    $dotnetRelease = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" -ErrorAction Stop).Release
}
catch {}

$dotnet472 = ($dotnetRelease -ge 461808)
Add-Check "Runtime" ".NET Framework 4.7.2+" $(if ($dotnet472) { "PASS" } else { "FAIL" }) $(if ($dotnet472) { "Release $dotnetRelease" } else { "Not found or too old" }) "Required for WinSW service wrapper"

# =============================================================
# 4. Ports Available
# =============================================================
Write-Host "[4/10] Port availability..." -ForegroundColor Yellow

foreach ($port in @(80, 443, 5000)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($port -eq 5000) {
        Add-Check "Network" "Port $port available" $(if (-not $listener) { "PASS" } else { "WARN" }) $(if ($listener) { "In use by PID $($listener[0].OwningProcess)" } else { "Available" }) "Backend will bind to localhost:5000"
    }
    else {
        Add-Check "Network" "Port $port" "INFO" $(if ($listener) { "In use (IIS expected)" } else { "Available" }) ""
    }
}

# =============================================================
# 5. TLS/SSL
# =============================================================
Write-Host "[5/10] TLS/SSL certificates..." -ForegroundColor Yellow

$certs = Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
    Where-Object { $_.NotAfter -gt (Get-Date) -and $_.HasPrivateKey }

if ($certs.Count -gt 0) {
    $cert = $certs | Sort-Object NotAfter -Descending | Select-Object -First 1
    $daysLeft = ($cert.NotAfter - (Get-Date)).Days
    Add-Check "TLS" "Valid SSL certificate" "PASS" "$($cert.Subject) — expires in $daysLeft days" ""
}
else {
    Add-Check "TLS" "Valid SSL certificate" "WARN" "No valid certs with private key in LocalMachine\My" "Import or request an SSL certificate for the site hostname"
}

# =============================================================
# 6. Disk Space
# =============================================================
Write-Host "[6/10] Disk space..." -ForegroundColor Yellow

$drive = Get-PSDrive C
$freeGB = [math]::Round($drive.Free / 1GB, 1)
Add-Check "Resources" "Disk space (C:)" $(if ($freeGB -ge 1) { "PASS" } else { "FAIL" }) "$freeGB GB free" "Minimum 500 MB required for CallingBot"

# =============================================================
# 7. Memory
# =============================================================
Write-Host "[7/10] Available memory..." -ForegroundColor Yellow

$mem = Get-CimInstance Win32_OperatingSystem
$freeMemGB = [math]::Round($mem.FreePhysicalMemory / 1MB, 1)
$totalMemGB = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1)
Add-Check "Resources" "Available memory" $(if ($freeMemGB -ge 2) { "PASS" } else { "WARN" }) "$freeMemGB GB free of $totalMemGB GB" "Minimum 2 GB available recommended"

# =============================================================
# 8. SQL Server Connectivity
# =============================================================
Write-Host "[8/10] SQL Server connectivity..." -ForegroundColor Yellow

if ($SqlServer) {
    $tcpTest = Test-NetConnection -ComputerName $SqlServer -Port 1433 -WarningAction SilentlyContinue
    Add-Check "Database" "SQL Server reachable ($SqlServer`:1433)" $(if ($tcpTest.TcpTestSucceeded) { "PASS" } else { "FAIL" }) $(if ($tcpTest.TcpTestSucceeded) { "TCP connection successful" } else { "Connection failed" }) "Ensure SQL Server is running and port 1433 is open"
}
else {
    Add-Check "Database" "SQL Server connectivity" "INFO" "Skipped (use -SqlServer to test)" "Provide SQL Server hostname to validate"
}

# =============================================================
# 9. Outbound HTTPS
# =============================================================
Write-Host "[9/10] Outbound HTTPS..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "https://www.microsoft.com" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Add-Check "Network" "Outbound HTTPS" "PASS" "Status $($response.StatusCode)" ""
}
catch {
    Add-Check "Network" "Outbound HTTPS" "WARN" "Could not reach external HTTPS" "Required for OmniDimension API calls"
}

# =============================================================
# 10. Service Account
# =============================================================
Write-Host "[10/10] Service account..." -ForegroundColor Yellow

$serviceAccount = "NT SERVICE\CallingBot"
Add-Check "Permissions" "Service account" "INFO" "$serviceAccount (virtual, created automatically)" "WinSW creates this when the service is installed"

$adminCheck = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Add-Check "Permissions" "Running as administrator" $(if ($adminCheck) { "PASS" } else { "WARN" }) $(if ($adminCheck) { "Yes" } else { "No — some install steps require elevation" }) "Run PowerShell as Administrator for deployment"

# =============================================================
# Generate PREREQUISITES_REPORT.md
# =============================================================
$passCount = @($checks | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = @($checks | Where-Object { $_.Status -eq "FAIL" }).Count
$warnCount = @($checks | Where-Object { $_.Status -eq "WARN" }).Count
$infoCount = @($checks | Where-Object { $_.Status -eq "INFO" }).Count

$lines = @()
$lines += "# CallingBot Infrastructure Prerequisites Report"
$lines += ""
$lines += "**Server:** $($os.Caption) ($arch)"
$lines += "**Date:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$lines += "**Result:** $passCount passed, $failCount failed, $warnCount warnings, $infoCount info"
$lines += ""

if ($failCount -gt 0) {
    $lines += "> **Action Required:** $failCount prerequisite(s) not met. See remediation steps below."
    $lines += ""
}

$lines += "## Results"
$lines += ""
$lines += "| Category | Check | Status | Detail |"
$lines += "|----------|-------|--------|--------|"

foreach ($c in $checks) {
    $st = switch ($c.Status) { "PASS" { "PASS" }; "FAIL" { "**FAIL**" }; "WARN" { "WARN" }; "INFO" { "INFO" } }
    $lines += "| $($c.Category) | $($c.Item) | $st | $($c.Detail) |"
}

$failedChecks = $checks | Where-Object { $_.Status -eq "FAIL" -or $_.Status -eq "WARN" }
if ($failedChecks.Count -gt 0) {
    $lines += ""
    $lines += "## Remediation"
    $lines += ""
    foreach ($c in $failedChecks) {
        if ($c.Remediation) {
            $lines += "- **$($c.Item):** $($c.Remediation)"
        }
    }
}

$lines += ""
$lines += "## Full Prerequisites Checklist"
$lines += ""
$lines += "- [ ] Windows Server 2019+ (x64)"
$lines += "- [ ] IIS 10 with URL Rewrite 2.1 and ARR 3.0"
$lines += "- [ ] .NET Framework 4.7.2+"
$lines += "- [ ] SSL certificate for site hostname, bound to port 443"
$lines += "- [ ] SQL Server 2019+ with database provisioned"
$lines += "- [ ] Ports 80/443 open inbound, port 5000 localhost only"
$lines += "- [ ] Outbound HTTPS allowed (for OmniDimension API)"
$lines += "- [ ] 500 MB disk space, 2 GB RAM available"
$lines += "- [ ] Administrator access for installation"
$lines += "- [ ] OmniDimension API key and endpoint URL"
$lines += ""

$reportPath = Join-Path $root "PREREQUISITES_REPORT.md"
($lines -join "`n") | Out-File -FilePath $reportPath -Encoding utf8

# =============================================================
# Summary
# =============================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Prerequisites Check Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Passed:   $passCount" -ForegroundColor Green
Write-Host "  Failed:   $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "  Warnings: $warnCount" -ForegroundColor $(if ($warnCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Info:     $infoCount" -ForegroundColor Gray
Write-Host "  Report:   $reportPath" -ForegroundColor Gray
Write-Host ""

exit $failCount
